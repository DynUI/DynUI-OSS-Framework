/**
 * Validate a generated UITree against the manifest + global constraints.
 *
 * This is the safety boundary that makes bounded generation (L4) shippable: the
 * model may emit anything, but only trees that pass here are allowed to render.
 * Anything else is repaired or replaced with the deterministic fallback upstream.
 */
export function validateTree(tree, manifest) {
    const errors = [];
    const byId = new Map(manifest.components.map((c) => [c.id, c]));
    const constraints = manifest.constraints;
    const allowedCats = constraints.allowedCategoriesBySurface?.[tree.surface];
    // Experiment-gated components may only appear when the tree carries the enabling
    // assignment — this is what stops a canary leaking to unassigned users.
    const enabledExperiments = new Set((tree.meta?.experiments ?? []).map((a) => `${a.experimentId}:${a.variant}`));
    const present = new Set();
    let aboveFoldCount = 0;
    const err = (code, nodePath, message) => errors.push({ code, nodePath, message });
    function walk(node, path, inAboveFold) {
        if (node.type === "component") {
            const def = byId.get(node.componentId ?? "");
            if (!def) {
                err("unknown-component", path, `Unknown component '${node.componentId}'`);
                return;
            }
            present.add(def.id);
            if (inAboveFold)
                aboveFoldCount++;
            if (node.variant && !def.variants.some((v) => v.id === node.variant)) {
                err("unknown-variant", path, `'${def.id}' has no variant '${node.variant}'`);
            }
            if (allowedCats && !allowedCats.includes(def.category)) {
                err("constraint-violation", path, `Category '${def.category}' not allowed on surface '${tree.surface}'`);
            }
            if (def.experiment &&
                !enabledExperiments.has(`${def.experiment.id}:${def.experiment.enableForVariant}`)) {
                err("constraint-violation", path, `'${def.id}' is gated behind experiment '${def.experiment.id}' (variant '${def.experiment.enableForVariant}') but the tree carries no such assignment`);
            }
            // Data bindings must reference declared data keys; required data must be bound.
            const dataKeys = new Set(def.data.map((d) => d.key));
            const boundSrcs = new Set(Object.values(node.dataBindings ?? {}));
            for (const [k, src] of Object.entries(node.dataBindings ?? {})) {
                if (!dataKeys.has(src)) {
                    err("unknown-data-binding", path, `Binding '${k}' -> '${src}' is not a declared data key of '${def.id}'`);
                }
            }
            for (const d of def.data) {
                if (d.required && !boundSrcs.has(d.key)) {
                    err("missing-required-data", path, `Required data '${d.key}' not bound for '${def.id}'`);
                }
            }
            // Slots: known ids, accepted categories, required present.
            const slotDefs = new Map(def.slots.map((s) => [s.id, s]));
            for (const [slotId, children] of Object.entries(node.slots ?? {})) {
                const sd = slotDefs.get(slotId);
                if (!sd) {
                    err("unknown-slot", path, `'${def.id}' has no slot '${slotId}'`);
                    continue;
                }
                children.forEach((child, i) => {
                    const childPath = `${path}/slots.${slotId}[${i}]`;
                    if (child.type === "component") {
                        const cdef = byId.get(child.componentId ?? "");
                        if (cdef &&
                            !(sd.accepts.includes("*") ||
                                sd.accepts.includes(cdef.category) ||
                                sd.accepts.includes(cdef.id))) {
                            err("slot-category-mismatch", childPath, `Slot '${slotId}' does not accept '${cdef.category}'`);
                        }
                    }
                    walk(child, childPath, false);
                });
            }
            for (const s of def.slots) {
                if (s.required && !node.slots?.[s.id]?.length) {
                    err("missing-required-slot", path, `Required slot '${s.id}' missing for '${def.id}'`);
                }
            }
        }
        else {
            const aboveFold = inAboveFold || node.label === "above-the-fold";
            (node.children ?? []).forEach((ch, i) => walk(ch, `${path}/children[${i}]`, aboveFold));
        }
    }
    walk(tree.root, "root", false);
    // Global constraints ---------------------------------------------------------
    for (const id of constraints.neverHide ?? []) {
        if (!present.has(id)) {
            err("constraint-violation", "root", `neverHide: '${id}' is missing from the tree`);
        }
    }
    if (constraints.maxModulesAboveFold != null &&
        aboveFoldCount > constraints.maxModulesAboveFold) {
        err("constraint-violation", "root", `Above-the-fold has ${aboveFoldCount} modules; max is ${constraints.maxModulesAboveFold}`);
    }
    const order = componentOrder(tree.root);
    for (const p of constraints.pinned ?? []) {
        if (p.position === "top" && order[0] !== p.componentId) {
            err("constraint-violation", "root", `pinned top: '${p.componentId}' must be first`);
        }
        if (p.position === "bottom" && order[order.length - 1] !== p.componentId) {
            err("constraint-violation", "root", `pinned bottom: '${p.componentId}' must be last`);
        }
    }
    return { ok: errors.length === 0, errors };
}
function componentOrder(root) {
    const out = [];
    (function rec(n) {
        if (n.type === "component" && n.componentId)
            out.push(n.componentId);
        (n.children ?? []).forEach(rec);
        Object.values(n.slots ?? {})
            .flat()
            .forEach(rec);
    })(root);
    return out;
}
