(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
	typeof define === 'function' && define.amd ? define(['exports'], factory) :
	(global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.JsonEditor = {}));
})(this, (function (exports) { 'use strict';

	const ROOT_PATH = [];
	function isObject(value) {
		return value !== null && typeof value === "object" && !Array.isArray(value)
	}
	function getType(value) {
		if (value === null) return "null"
		if (Array.isArray(value)) return "array"
		return typeof value
	}
	function pathToString(path) {
		if (!path || path.length === 0) return ""
		return "/" + path.map(String).join("/")
	}
	const DEFAULT_MESSAGES = {
		invalid: "Value does not match schema",
		required: "Missing required: {fields}",
		min: "Must be ≥ {min}",
		max: "Must be ≤ {max}",
		exclusiveMin: "Must be > {min}",
		exclusiveMax: "Must be < {max}",
		minLength: "Must be at least {min} characters",
		maxLength: "Must be at most {max} characters",
		pattern: "Does not match required format"
	};
	function formatMessage(template, params = {}) {
		return template.replace(
			/\{(\w+)\}/g,
			(match, key) => {
				if (Object.prototype.hasOwnProperty.call(params, key)) return String(params[key])
				return match
			}
		)
	}
	function cloneContainer(value) {
		return Array.isArray(value) ? value.slice() : { ...value }
	}
	function updateAtPath(root, path, updater) {
		if (path.length === 0) return updater(root)
		const [head, ...rest] = path;
		const container = cloneContainer(root || (typeof head === "number" ? [] : {}));
		container[head] = updateAtPath(container[head], rest, updater);
		return container
	}
	function removeAtPath(root, path) {
		if (path.length === 0) return undefined
		const [head, ...rest] = path;
		const container = cloneContainer(root);
		if (rest.length === 0) {
			if (Array.isArray(container)) {
				container.splice(head, 1);
			}
			else {
				delete container[head];
			}
			return container
		}
		container[head] = removeAtPath(container[head], rest);
		return container
	}
	function moveInArray(root, path, fromIndex, toIndex) {
		return updateAtPath(
			root,
			path,
			(arr) => {
				const next = Array.isArray(arr) ? arr.slice() : [];
				const [item] = next.splice(fromIndex, 1);
				next.splice(toIndex, 0, item);
				return next
			}
		)
	}
	function moveKeyInObject(root, path, fromKey, toIndex) {
		return updateAtPath(
			root,
			path,
			(obj) => {
				const current = isObject(obj) ? obj : {};
				const keys = Object.keys(current);
				const fromIndex = keys.indexOf(fromKey);
				if (fromIndex === -1) return current
				const nextKeys = keys.slice();
				const [key] = nextKeys.splice(fromIndex, 1);
				const clamped = Math.max(0, Math.min(toIndex, nextKeys.length));
				nextKeys.splice(clamped, 0, key);
				const next = {};
				nextKeys.forEach(
					(k) => {
						next[k] = current[k];
					}
				);
				return next
			}
		)
	}
	function renameKey(root, path, newKey) {
		if (path.length === 0) return root
		const parentPath = path.slice(0, -1);
		const oldKey = path[path.length - 1];
		return updateAtPath(
			root,
			parentPath,
			(obj) => {
				const next = { ...(obj || {}) };
				next[newKey] = next[oldKey];
				delete next[oldKey];
				return next
			}
		)
	}
	function normalizeSchema(schema) {
		if (!schema) return null
		if (schema.oneOf || schema.anyOf) return schema
		return schema
	}
	function pickFirstSchema(schema) {
		if (!schema) return null
		if (schema.oneOf && schema.oneOf.length) return schema.oneOf[0]
		if (schema.anyOf && schema.anyOf.length) return schema.anyOf[0]
		return schema
	}
	function defaultValueForSchema(schema) {
		const resolved = pickFirstSchema(schema) || {};
		if (Object.prototype.hasOwnProperty.call(resolved, "const")) return resolved.const
		if (Array.isArray(resolved.enum) && resolved.enum.length) return resolved.enum[0]
		if (resolved.default !== undefined) return resolved.default
		const type = Array.isArray(resolved.type) ? resolved.type[0] : resolved.type;
		switch (type) {
			case "string":
				return null
			case "number":
			case "integer":
				return 0
			case "boolean":
				return false
			case "array":
				return []
			case "object":
				return {}
			case "null":
				return null
			default:
				return null
		}
	}
	function defaultValueForType(type) {
		switch (type) {
			case "string":
				return ""
			case "number":
			case "integer":
				return 0
			case "boolean":
				return false
			case "array":
				return []
			case "object":
				return {}
			case "null":
			default:
				return null
		}
	}
	function validateValue(value, schema, editor) {
		if (!schema) return []
		const resolved = pickFirstSchema(schema) || {};
		const errors = [];
		if (Object.prototype.hasOwnProperty.call(resolved, "const")) {
			if (value !== resolved.const) errors.push(editor.getMessage("invalid"));
			return errors
		}
		if (Array.isArray(resolved.enum)) {
			if (!resolved.enum.includes(value)) errors.push(editor.getMessage("invalid"));
			return errors
		}
		if (resolved.type) {
			const type = getType(value);
			if (Array.isArray(resolved.type)) {
				if (!resolved.type.includes(type)) errors.push(editor.getMessage("invalid"));
				return errors
			}
			if (resolved.type === "integer") {
				if (!(typeof value === "number" && Number.isInteger(value))) {
					errors.push(editor.getMessage("invalid"));
					return errors
				}
				if (resolved.minimum !== undefined && value < resolved.minimum) {
					errors.push(editor.getMessage("min", { min: resolved.minimum }));
				}
				if (resolved.maximum !== undefined && value > resolved.maximum) {
					errors.push(editor.getMessage("max", { max: resolved.maximum }));
				}
				if (resolved.exclusiveMinimum !== undefined && value <= resolved.exclusiveMinimum) {
					errors.push(editor.getMessage("exclusiveMin", { min: resolved.exclusiveMinimum }));
				}
				if (resolved.exclusiveMaximum !== undefined && value >= resolved.exclusiveMaximum) {
					errors.push(editor.getMessage("exclusiveMax", { max: resolved.exclusiveMaximum }));
				}
				return errors
			}
			if (type !== resolved.type) {
				errors.push(editor.getMessage("invalid"));
				return errors
			}
			if (resolved.type === "number") {
				if (resolved.minimum !== undefined && value < resolved.minimum) {
					errors.push(editor.getMessage("min", { min: resolved.minimum }));
				}
				if (resolved.maximum !== undefined && value > resolved.maximum) {
					errors.push(editor.getMessage("max", { max: resolved.maximum }));
				}
				if (resolved.exclusiveMinimum !== undefined && value <= resolved.exclusiveMinimum) {
					errors.push(editor.getMessage("exclusiveMin", { min: resolved.exclusiveMinimum }));
				}
				if (resolved.exclusiveMaximum !== undefined && value >= resolved.exclusiveMaximum) {
					errors.push(editor.getMessage("exclusiveMax", { max: resolved.exclusiveMaximum }));
				}
				return errors
			}
			if (resolved.type === "string") {
				if (resolved.minLength !== undefined && String(value).length < resolved.minLength) {
					errors.push(editor.getMessage("minLength", { min: resolved.minLength }));
				}
				if (resolved.maxLength !== undefined && String(value).length > resolved.maxLength) {
					errors.push(editor.getMessage("maxLength", { max: resolved.maxLength }));
				}
				if (resolved.pattern) {
					try {
						const re = new RegExp(resolved.pattern);
						if (!re.test(String(value))) errors.push(editor.getMessage("pattern"));
					}
					catch {
						return errors
					}
				}
			}
			return errors
		}
		return errors
	}
	function collectAddOptionsForObject(value, schema, lenient) {
		const options = [];
		const resolved = normalizeSchema(schema) || {};
		if (!schema) {
			return [{ kind: "freeform", type: "string", label: "Field" }, { kind: "freeform", type: "object", label: "Object" }, { kind: "freeform", type: "array", label: "Array" }]
		}
		const properties = resolved.properties || {};
		const existing = isObject(value) ? value : {};
		const required = Array.isArray(resolved.required) ? resolved.required : [];
		const keys = Object.keys(properties);
		const sortedKeys = keys.sort(
			(a, b) => {
				const aReq = required.includes(a);
				const bReq = required.includes(b);
				if (aReq && !bReq) return -1
				if (!aReq && bReq) return 1
				return a.localeCompare(b)
			}
		);
		for (const key of sortedKeys) {
			if (Object.prototype.hasOwnProperty.call(existing, key)) continue
			options.push({
				kind: "known",
				key,
				label: key,
				schema: properties[key] || null
			});
		}
		const additional = resolved.additionalProperties;
		const allowOther = lenient || additional === true || isObject(additional);
		if (allowOther) {
			options.push({
				kind: "other",
				key: null,
				label: "Other…",
				schema: isObject(additional) ? additional : null
			});
		}
		return options
	}
	function collectAddOptionsForArray(schema) {
		const resolved = normalizeSchema(schema) || {};
		const options = [];
		if (!schema) {
			return [{ label: "Field", type: "string" }, { label: "Object", type: "object" }, { label: "Array", type: "array" }]
		}
		if (resolved.items) {
			if (resolved.items.oneOf || resolved.items.anyOf) {
				const variants = resolved.items.oneOf || resolved.items.anyOf || [];
				variants.forEach(
					(itemSchema, index) => {
						const label = itemSchema.title || `Option ${index + 1}`;
						options.push({ label, schema: itemSchema });
					}
				);
			}
			else {
				options.push({ label: "Item", schema: resolved.items });
			}
		}
		else {
			options.push({ label: "Item", schema: null });
		}
		return options
	}
	function buildTree({ value, schema, path, editor, parentType }) {
		const resolved = normalizeSchema(schema);
		const valueType = getType(value);
		const pathKey = pathToString(path);
		const inferredTitle = path.length ? String(path[path.length - 1]) : "Root";
		const hideTitle = parentType === "array" || parentType === "object";
		const showDoc = parentType !== "object";
		const title = (resolved && resolved.title) || (hideTitle ? "" : inferredTitle);
		const description = resolved && resolved.description;
		const collapsed = editor.defaultCollapsed ? !editor.collapsed.has(pathKey) : editor.collapsed.has(pathKey);
		const errors = validateValue(value, resolved, editor);
		if (valueType === "object" || (value === undefined && resolved && resolved.type === "object")) {
			const objValue = isObject(value) ? value : {};
			const required = Array.isArray(resolved && resolved.required) ? resolved.required : [];
			const missingRequired = required.filter((key) => !Object.prototype.hasOwnProperty.call(objValue, key));
			const missingRequiredMessage = missingRequired.length ? editor.getMessage("required", { fields: missingRequired.join(", ") }) : null;
			const keys = Object.keys(objValue);
			const properties = keys.map(
				(key, index) => {
					const childSchema = resolved && resolved.properties ? resolved.properties[key] : null;
					const childNode = buildTree({
						value: objValue[key],
						schema: childSchema,
						path: path.concat(key),
						editor,
						parentType: "object"
					});
					return {
						key,
						index,
						count: keys.length,
						required: required.includes(key),
						node: childNode,
						remove() {
							editor.applyOp({ type: "removeValue", path: path.concat(key) });
						},
						rename(newKey) {
							editor.applyOp({ type: "renameKey", path: path.concat(key), newKey });
						},
						moveTo(toIndex) {
							editor.applyOp({
								type: "moveKey",
								path,
								key,
								toIndex
							});
						}
					}
				}
			);
			const addOptions = collectAddOptionsForObject(objValue, resolved, editor.lenient);
			const node = {
				kind: "object",
				path,
				title,
				description,
				collapsed,
				errors,
				missingRequired,
				missingRequiredMessage,
				properties,
				addOptions,
				freeform: !schema,
				toggle() {
					editor.toggleCollapse(path);
				},
				addField(option, customKey) {
					editor.applyOp({
						type: "addField",
						path,
						option,
						customKey
					});
				}
			};
			node.setCollapsedDeep = (target) => {
				const apply = (current) => {
					if (!current) return
					if (current.kind === "object" || current.kind === "array") {
						editor.setCollapsedForPath(current.path, target);
						const children = current.kind === "object" ? current.properties.map((prop) => prop.node) : current.items.map((item) => item.node);
						children.forEach(apply);
					}
				};
				apply(node);
				editor.render();
			};
			return node
		}
		if (valueType === "array" || (value === undefined && resolved && resolved.type === "array")) {
			const arrValue = Array.isArray(value) ? value : [];
			const items = arrValue.map(
				(item, index) => {
					const itemSchema = resolved && resolved.items ? resolved.items : null;
					const childNode = buildTree({
						value: item,
						schema: itemSchema,
						path: path.concat(index),
						editor,
						parentType: "array"
					});
					return {
						index,
						node: childNode,
						remove() {
							editor.applyOp({ type: "removeValue", path: path.concat(index) });
						},
						moveUp() {
							if (index === 0) return
							editor.applyOp({
								type: "moveItem",
								path,
								from: index,
								to: index - 1
							});
						},
						moveDown() {
							if (index === arrValue.length - 1) return
							editor.applyOp({
								type: "moveItem",
								path,
								from: index,
								to: index + 1
							});
						},
						moveTo(toIndex) {
							if (toIndex === index) return
							editor.applyOp({
								type: "moveItem",
								path,
								from: index,
								to: toIndex
							});
						}
					}
				}
			);
			const addOptions = collectAddOptionsForArray(resolved);
			const node = {
				kind: "array",
				path,
				title,
				description,
				collapsed,
				errors,
				count: arrValue.length,
				items,
				addOptions,
				toggle() {
					editor.toggleCollapse(path);
				},
				addItem(option) {
					editor.applyOp({ type: "addItem", path, option });
				}
			};
			node.setCollapsedDeep = (target) => {
				const apply = (current) => {
					if (!current) return
					if (current.kind === "object" || current.kind === "array") {
						editor.setCollapsedForPath(current.path, target);
						const children = current.kind === "object" ? current.properties.map((prop) => prop.node) : current.items.map((item) => item.node);
						children.forEach(apply);
					}
				};
				apply(node);
				editor.render();
			};
			return node
		}
		return {
			kind: "field",
			path,
			title,
			description,
			value,
			fieldType: valueType,
			schema: resolved,
			errors,
			showLabel: !hideTitle,
			showDoc,
			update(nextValue) {
				editor.applyOp({ type: "setValue", path, value: nextValue });
			},
			remove() {
				editor.applyOp({ type: "removeValue", path });
			}
		}
	}
	function createEditorCore({ value, schema, lenient = false, onChange, onRender, onUpdate, defaultCollapsed = true, messages = null, messageResolver = null }) {
		const editor = {
			value,
			schema,
			lenient,
			collapsed: new Set(),
			defaultCollapsed,
			onChange,
			onRender,
			onUpdate,
			messages,
			messageResolver,
			subscribers: new Set()
		};
		editor.getMessage = (key, params) => {
			if (typeof editor.messageResolver === "function") {
				return editor.messageResolver(key, params)
			}
			const template = (editor.messages && editor.messages[key]) || DEFAULT_MESSAGES[key] || DEFAULT_MESSAGES.invalid;
			return formatMessage(template, params)
		};
		editor.toggleCollapse = (path) => {
			const key = pathToString(path);
			if (editor.collapsed.has(key)) editor.collapsed.delete(key);
			else editor.collapsed.add(key);
			editor.render();
		};
		editor.setCollapsedForPath = (path, collapsed) => {
			const key = pathToString(path);
			if (editor.defaultCollapsed) {
				if (collapsed) editor.collapsed.delete(key);
				else editor.collapsed.add(key);
			}
			else {
				if (collapsed) editor.collapsed.add(key);
				else editor.collapsed.delete(key);
			}
		};
		editor.applyOp = (op) => {
			switch (op.type) {
				case "setValue":
					editor.value = updateAtPath(editor.value, op.path, () => op.value);
				break
				case "removeValue":
					editor.value = removeAtPath(editor.value, op.path);
				break
				case "addField":
					{
						const option = op.option;
						let key = option && option.kind === "known" ? option.key : op.customKey;
						if (!key) return
						const schemaForKey = option && option.schema ? option.schema : null;
						const initial = option && option.kind === "freeform" ? defaultValueForType(option.type) : defaultValueForSchema(schemaForKey);
						editor.value = updateAtPath(
							editor
									.value,
							op
									.path,
							(obj) => {
								const next = isObject(obj) ? { ...obj } : {};
								if (Object.prototype.hasOwnProperty.call(next, key)) return next
								next[key] = initial;
								return next
							}
						);
						break
					}
				case "addItem":
					{
						const schemaForItem = op.option && op.option.schema ? op.option.schema : null;
						const initial = op.option && op.option.type ? defaultValueForType(op.option.type) : defaultValueForSchema(schemaForItem);
						editor.value = updateAtPath(
							editor
									.value,
							op
									.path,
							(arr) => {
								const next = Array.isArray(arr) ? arr.slice() : [];
								next.push(initial);
								return next
							}
						);
						break
					}
				case "moveItem":
					editor.value = moveInArray(editor.value, op.path, op.from, op.to);
				break
				case "renameKey":
					editor.value = renameKey(editor.value, op.path, op.newKey);
				break
				case "moveKey":
					editor.value = moveKeyInObject(editor.value, op.path, op.key, op.toIndex);
				break
			}
			if (editor.onChange) editor.onChange(editor.value);
			if (editor.onUpdate) editor.onUpdate(editor.value);
			editor.subscribers.forEach((fn) => fn(editor.value));
			editor.render();
		};
		editor.render = () => {
			const tree = buildTree({
				value: editor.value,
				schema: editor.schema,
				path: ROOT_PATH,
				editor,
				parentType: null
			});
			if (editor.onRender) editor.onRender(tree);
		};
		editor.setValue = (nextValue) => {
			editor.value = nextValue;
			if (editor.onChange) editor.onChange(editor.value);
			if (editor.onUpdate) editor.onUpdate(editor.value);
			editor.subscribers.forEach((fn) => fn(editor.value));
			editor.render();
		};
		editor.setSchema = (nextSchema) => {
			editor.schema = nextSchema;
			editor.render();
		};
		editor.destroy = () => {
			editor.onRender = null;
			editor.onChange = null;
			editor.onUpdate = null;
			editor.collapsed.clear();
			editor.subscribers.clear();
		};
		editor.subscribe = (fn) => {
			editor.subscribers.add(fn);
			return () => editor.subscribers.delete(fn)
		};
		editor.render();
		return editor
	}
	function el(tag, className, text) {
		const node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined) node.textContent = text;
		return node
	}
	const SVG_NS = "http://www.w3.org/2000/svg";
	function createSvgIcon(kind) {
		const svg = document.createElementNS(SVG_NS, "svg");
		svg.setAttribute("viewBox", "0 0 16 16");
		svg.setAttribute("aria-hidden", "true");
		svg.setAttribute("focusable", "false");
		svg.classList.add("je-icon-svg");
		svg.dataset.icon = kind;
		if (kind === "drag") {
			const positions = [{ x: 5, y: 4 }, { x: 11, y: 4 }, { x: 5, y: 8 }, { x: 11, y: 8 }, { x: 5, y: 12 }, { x: 11, y: 12 }];
			positions.forEach(
				({ x, y }) => {
					const dot = document.createElementNS(SVG_NS, "circle");
					dot.setAttribute("cx", String(x));
					dot.setAttribute("cy", String(y));
					dot.setAttribute("r", "1.1");
					dot.setAttribute("fill", "currentColor");
					svg.appendChild(dot);
				}
			);
		}
		if (kind === "remove") {
			const line1 = document.createElementNS(SVG_NS, "line");
			line1.setAttribute("x1", "4");
			line1.setAttribute("y1", "4");
			line1.setAttribute("x2", "12");
			line1.setAttribute("y2", "12");
			line1.setAttribute("stroke", "currentColor");
			line1.setAttribute("stroke-width", "1.5");
			line1.setAttribute("stroke-linecap", "round");
			const line2 = document.createElementNS(SVG_NS, "line");
			line2.setAttribute("x1", "12");
			line2.setAttribute("y1", "4");
			line2.setAttribute("x2", "4");
			line2.setAttribute("y2", "12");
			line2.setAttribute("stroke", "currentColor");
			line2.setAttribute("stroke-width", "1.5");
			line2.setAttribute("stroke-linecap", "round");
			svg.appendChild(line1);
			svg.appendChild(line2);
		}
		if (kind === "info") {
			const circle = document.createElementNS(SVG_NS, "circle");
			circle.setAttribute("cx", "8");
			circle.setAttribute("cy", "8");
			circle.setAttribute("r", "6");
			circle.setAttribute("stroke", "currentColor");
			circle.setAttribute("stroke-width", "1.2");
			circle.setAttribute("fill", "none");
			const stem = document.createElementNS(SVG_NS, "line");
			stem.setAttribute("x1", "8");
			stem.setAttribute("y1", "7");
			stem.setAttribute("x2", "8");
			stem.setAttribute("y2", "11");
			stem.setAttribute("stroke", "currentColor");
			stem.setAttribute("stroke-width", "1.4");
			stem.setAttribute("stroke-linecap", "round");
			const dot = document.createElementNS(SVG_NS, "circle");
			dot.setAttribute("cx", "8");
			dot.setAttribute("cy", "4.6");
			dot.setAttribute("r", "1");
			dot.setAttribute("fill", "currentColor");
			svg.appendChild(circle);
			svg.appendChild(stem);
			svg.appendChild(dot);
		}
		return svg
	}
	function ensureIcon(element, kind) {
		const current = element.firstElementChild;
		if (!current || current.tagName.toLowerCase() !== "svg" || !current.classList.contains("je-icon-svg")) {
			element.replaceChildren(createSvgIcon(kind));
			return
		}
		if (!current.dataset.icon || current.dataset.icon !== kind) {
			element.replaceChildren(createSvgIcon(kind));
		}
	}
	function applyClasses(element, extra) {
		if (!extra) return
		extra.split(" ").forEach(
			(cls) => {
				const trimmed = cls.trim();
				if (trimmed) element.classList.add(trimmed);
			}
		);
	}
	function attachAction(element, event, handler) {
		const key = `_je_${event}`;
		if (!element[key]) {
			element.addEventListener(event, (ev) => element[key].handler(ev));
		}
		element[key] = { handler };
	}
	function ensureChild(parent, selector, create) {
		let child = parent.querySelector(selector);
		if (!child) {
			child = create();
			parent.appendChild(child);
		}
		return child
	}
	function reconcileChildren(container, orderedChildren) {
		const existing = Array.from(container.children);
		const keep = new Set(orderedChildren);
		existing.forEach(
			(child) => {
				if (!keep.has(child)) container.removeChild(child);
			}
		);
		orderedChildren.forEach(
			(child, index) => {
				const current = container.children[index];
				if (current !== child) {
					container.insertBefore(child, current || null);
				}
			}
		);
	}
	function createDragController(root) {
		const state = {
			active: false,
			row: null,
			parentKey: null,
			kind: null,
			moveTo: null,
			pointerId: null,
			startX: 0,
			startY: 0,
			moved: false,
			dropIndex: null,
			dropTarget: null,
			dropPlacement: null
		};
		function clearDrop() {
			if (state.dropTarget) {
				state.dropTarget.classList.remove("je-drop-before", "je-drop-after");
			}
			state.dropTarget = null;
			state.dropPlacement = null;
			state.dropIndex = null;
		}
		function getRows() {
			if (!state.parentKey) return []
			return Array.from(root
					.querySelectorAll(`.je-row[data-parent="${state.parentKey}"][data-kind="${state.kind}"]`))
		}
		function onPointerMove(event) {
			if (!state.active) return
			const deltaX = Math.abs(event.clientX - state.startX);
			const deltaY = Math.abs(event.clientY - state.startY);
			if (!state.moved && deltaX + deltaY < 4) return
			state.moved = true;
			const rows = getRows().filter((row) => row !== state.row);
			if (!rows.length) {
				clearDrop();
				state.dropIndex = 0;
				return
			}
			let target = null;
			let placement = "after";
			let dropIndex = rows.length;
			for (let i = 0; i < rows.length; i += 1) {
				const rect = rows[i].getBoundingClientRect();
				const mid = rect.top + rect.height / 2;
				if (event.clientY < mid) {
					target = rows[i];
					placement = "before";
					dropIndex = i;
					break
				}
			}
			if (!target) {
				target = rows[rows.length - 1];
				placement = "after";
				dropIndex = rows.length;
			}
			if (state.dropTarget !== target || state.dropPlacement !== placement) {
				clearDrop();
				state.dropTarget = target;
				state.dropPlacement = placement;
				target.classList.add(placement === "before" ? "je-drop-before" : "je-drop-after");
			}
			state.dropIndex = dropIndex;
		}
		function cleanup() {
			window.removeEventListener("pointermove", onPointerMove);
			window.removeEventListener("pointerup", onPointerUp);
			window.removeEventListener("pointercancel", onPointerUp);
		}
		function onPointerUp() {
			if (!state.active) return
			if (state.row) state.row.classList.remove("je-dragging");
			if (state.moved && state.moveTo && state.dropIndex !== null) {
				state.moveTo(state.dropIndex);
			}
			clearDrop();
			state.active = false;
			state.row = null;
			state.parentKey = null;
			state.kind = null;
			state.moveTo = null;
			state.pointerId = null;
			state.moved = false;
			cleanup();
		}
		function startDrag(event, config) {
			if (event.button !== 0 && event.pointerType !== "touch") return
			event.preventDefault();
			state.active = true;
			state.row = config.row;
			state.parentKey = config.parentKey;
			state.kind = config.kind;
			state.moveTo = config.moveTo;
			state.pointerId = event.pointerId;
			state.startX = event.clientX;
			state.startY = event.clientY;
			state.moved = false;
			state.dropIndex = null;
			if (state.row) state.row.classList.add("je-dragging");
			window.addEventListener("pointermove", onPointerMove);
			window.addEventListener("pointerup", onPointerUp);
			window.addEventListener("pointercancel", onPointerUp);
		}
		return { startDrag }
	}
	function renderField(node, existing, classes, ui) {
		const pathKey = pathToString(node.path);
		let wrapper = existing;
		if (!wrapper || wrapper.dataset.kind !== "field" || wrapper.dataset.path !== pathKey) {
			wrapper = el("div", "je-field");
			wrapper.dataset.kind = "field";
			wrapper.dataset.path = pathKey;
			applyClasses(wrapper, classes && classes.field);
		}
		const label = node.showLabel && node.title ? ensureChild(wrapper, ":scope > .je-label", () => el("label", "je-label")) : wrapper.querySelector(":scope > .je-label");
		if (label) {
			if (node.showLabel && node.title) label.textContent = node.title;
			else wrapper.removeChild(label);
			applyClasses(label, classes && classes.label);
		}
		const schema = node.schema || {};
		const widget = schema && schema["ui:widget"] ? String(schema["ui:widget"]).toLowerCase() : null;
		const format = schema && schema.format ? String(schema.format).toLowerCase() : null;
		let input = wrapper.querySelector(":scope > .je-input");
		const isEnum = schema && Array.isArray(schema.enum);
		const isBool = !isEnum && node.fieldType === "boolean";
		const isNumber = !isEnum && node.fieldType === "number";
		let inputType = "text";
		if (isEnum) inputType = "select";
		else if (isBool) inputType = "checkbox";
		else if (isNumber) inputType = "number";
		else if (widget === "textarea") inputType = "textarea";
		else {
			switch (format) {
				case "date":
					inputType = "date";
				break
				case "time":
					inputType = "time";
				break
				case "email":
					inputType = "email";
				break
				default:
					inputType = "text";
				break
			}
		}
		if (!input || input.dataset.inputType !== inputType) {
			if (input) wrapper.removeChild(input);
			if (inputType === "select") input = el("select", "je-input");
			else if (inputType === "textarea") input = el("textarea", "je-input");
			else input = el("input", "je-input");
			wrapper.appendChild(input);
		}
		applyClasses(input, classes && classes.input);
		input.dataset.inputType = inputType;
		input.dataset.path = pathKey;
		input.dataset.kind = node.fieldType;
		if (isEnum) {
			input.replaceChildren();
			schema.enum
				.forEach(
					(value, index) => {
						const option = el("option", "", String(value));
						option.value = String(index);
						if (value === node.value) option.selected = true;
						input.appendChild(option);
					}
				);
			attachAction(
				input,
				"change",
				() => {
					const index = Number(input.value);
					const selected = schema.enum[index];
					node.update(selected);
				}
			);
		}
		else if (isBool) {
			input.type = "checkbox";
			attachAction(
				input,
				"change",
				() => {
					node.update(input.checked);
				}
			);
			if (document.activeElement !== input) {
				input.checked = Boolean(node.value);
			}
		}
		else if (isNumber) {
			input.type = "number";
			attachAction(
				input,
				"input",
				() => {
					const parsed = input.value === "" ? null : Number(input.value);
					node.update(Number.isNaN(parsed) ? null : parsed);
				}
			);
			if (document.activeElement !== input) {
				input.value = node.value == null ? "" : String(node.value);
			}
		}
		else if (inputType === "textarea") {
			attachAction(
				input,
				"input",
				() => {
					node.update(input.value === "" ? null : input.value);
				}
			);
			if (document.activeElement !== input) {
				input.value = node.value == null ? "" : String(node.value);
			}
		}
		else {
			input.type = inputType === "date" || inputType === "time" || inputType === "email" ? inputType : "text";
			attachAction(
				input,
				"input",
				() => {
					node.update(input.value === "" ? null : input.value);
				}
			);
			if (document.activeElement !== input) {
				input.value = node.value == null ? "" : String(node.value);
			}
		}
		const doc = node.showDoc && node.description ? ensureChild(wrapper, ":scope > .je-doc", () => el("span", "je-doc")) : wrapper.querySelector(":scope > .je-doc");
		if (doc) {
			if (node.showDoc && node.description) {
				doc.dataset.tooltip = node.description;
				ensureIcon(doc, "info");
				if (label && !label.contains(doc)) {
					label.appendChild(doc);
				}
				else if (!label) {
					const currentInput = wrapper.querySelector(":scope > .je-input");
					if (currentInput) {
						wrapper.insertBefore(doc, currentInput);
					}
				}
			}
			else {
				wrapper.removeChild(doc);
			}
			applyClasses(doc, classes && classes.docIcon);
		}
		const error = node.errors && node.errors.length ? ensureChild(wrapper, ":scope > .je-error", () => el("div", "je-error")) : wrapper.querySelector(":scope > .je-error");
		if (error) {
			if (node.errors && node.errors.length) error.textContent = node.errors.join(", ");
			else wrapper.removeChild(error);
			applyClasses(error, classes && classes.error);
		}
		return wrapper
	}
	function renderObject(node, existing, classes, ui) {
		const pathKey = pathToString(node.path);
		let wrapper = existing;
		if (!wrapper || wrapper.dataset.kind !== "object" || wrapper.dataset.path !== pathKey) {
			wrapper = el("div", "je-object");
			wrapper.dataset.kind = "object";
			wrapper.dataset.path = pathKey;
			applyClasses(wrapper, classes && classes.object);
		}
		const header = ensureChild(wrapper, ":scope > .je-header", () => el("div", "je-header"));
		applyClasses(header, classes && classes.header);
		const toggle = ensureChild(header, ":scope > .je-toggle", () => el("button", "je-toggle"));
		toggle.type = "button";
		toggle.textContent = node.collapsed ? "+" : "–";
		attachAction(
			toggle,
			"click",
			(event) => {
				if (event && event.shiftKey && node.setCollapsedDeep) {
					node.setCollapsedDeep(!node.collapsed);
				}
				else {
					node.toggle();
				}
			}
		);
		applyClasses(toggle, classes && classes.toggle);
		const title = ensureChild(header, ":scope > .je-title", () => el("div", "je-title"));
		title.textContent = node.title;
		applyClasses(title, classes && classes.title);
		const doc = node.path && node.path.length === 0 && node.description ? ensureChild(header, ":scope > .je-doc", () => el("span", "je-doc")) : header.querySelector(":scope > .je-doc");
		if (doc) {
			if (node.path && node.path.length === 0 && node.description) {
				doc.dataset.tooltip = node.description;
				ensureIcon(doc, "info");
				if (!header.contains(doc)) header.appendChild(doc);
			}
			else {
				header.removeChild(doc);
			}
			applyClasses(doc, classes && classes.docIcon);
		}
		let body = wrapper.querySelector(":scope > .je-body");
		if (!node.collapsed) {
			if (!body) {
				body = el("div", "je-body");
				wrapper.appendChild(body);
			}
			applyClasses(body, classes && classes.body);
			const rowMap = new Map();
			Array.from(body
					.querySelectorAll(":scope > .je-row"))
				.forEach(
					(row) => {
						rowMap.set(row.dataset.key, row);
					}
				);
			const rows = node.properties
				.map(
					(prop) => {
						let row = rowMap.get(prop.key);
						if (!row) {
							row = el("div", "je-row");
							row.dataset.key = prop.key;
						}
						const parentKey = pathKey || "root";
						row.dataset.parent = parentKey;
						row.dataset.kind = "object";
						row.dataset.index = String(prop.index);
						applyClasses(row, classes && classes.row);
						const icons = ensureChild(row, ":scope > .je-row-icons", () => el("div", "je-row-icons"));
						const remove = ensureChild(
							icons,
							":scope > .je-remove",
							() => {
								const btn = el("button", "je-remove je-icon-btn");
								btn.type = "button";
								btn.title = "Remove";
								return btn
							}
						);
						ensureIcon(remove, "remove");
						attachAction(remove, "click", () => prop.remove());
						applyClasses(remove, classes && classes.remove);
						const handle = ensureChild(
							icons,
							":scope > .je-drag-handle",
							() => {
								const btn = el("button", "je-drag-handle je-icon-btn");
								btn.type = "button";
								btn.title = "Drag to reorder";
								return btn
							}
						);
						ensureIcon(handle, "drag");
						attachAction(
							handle,
							"pointerdown",
							(event) => {
								if (!ui || !ui.drag) return
								ui.drag.startDrag(event, {
									row,
									parentKey,
									kind: "object",
									moveTo: (toIndex) => prop.moveTo(toIndex)
								});
							}
						);
						const key = ensureChild(row, ":scope > .je-key", () => el("div", "je-key"));
						key.textContent = prop.key;
						const keyDoc = prop.node && prop.node.description ? ensureChild(key, ":scope > .je-doc", () => el("span", "je-doc")) : key.querySelector(":scope > .je-doc");
						if (keyDoc) {
							if (prop.node && prop.node.description) {
								keyDoc.dataset.tooltip = prop.node.description;
								ensureIcon(keyDoc, "info");
							}
							else {
								key.removeChild(keyDoc);
							}
							applyClasses(keyDoc, classes && classes.docIcon);
						}
						applyClasses(key, classes && classes.key);
						const valueHost = ensureChild(row, ":scope > .je-value", () => el("div", "je-value"));
						applyClasses(valueHost, classes && classes.value);
						const currentChild = valueHost.firstElementChild;
						const nextChild = renderNode(prop.node, currentChild, classes, ui);
						if (currentChild !== nextChild) {
							valueHost.replaceChildren(nextChild);
						}
						reconcileChildren(row, [icons, key, valueHost]);
						return row
					}
				);
			let addRow = body.querySelector(":scope > .je-add");
			if (node.addOptions.length === 0) {
				if (addRow) body.removeChild(addRow);
				addRow = null;
			}
			else if (node.freeform) {
				if (!addRow) addRow = el("div", "je-add");
				applyClasses(addRow, classes && classes.addRow);
				const keyInput = ensureChild(
					addRow,
					":scope > .je-key-input",
					() => {
						const input = el("input", "je-input je-key-input");
						input.type = "text";
						input.placeholder = "Field name";
						return input
					}
				);
				const typeSelect = ensureChild(
					addRow,
					":scope > .je-type-select",
					() => {
						const select = el("select", "je-input je-type-select");
						return select
					}
				);
				typeSelect.replaceChildren();
				node.addOptions
					.forEach(
						(option, index) => {
							const opt = el("option", "", option.label);
							opt.value = String(index);
							typeSelect.appendChild(opt);
						}
					);
				const addBtn = ensureChild(addRow, ":scope > .je-add-btn", () => el("button", "je-add-btn", "Add"));
				addBtn.type = "button";
				addBtn.disabled = false;
				attachAction(
					addBtn,
					"click",
					() => {
						const key = keyInput.value.trim();
						if (!key) return
						const option = node.addOptions[Number(typeSelect.value) || 0];
						if (!option) return
						node.addField(option, key);
						keyInput.value = "";
					}
				);
				applyClasses(addBtn, classes && classes.addButton);
				if (!body.contains(addRow)) body.appendChild(addRow);
			}
			else {
				if (!addRow) addRow = el("div", "je-add");
				applyClasses(addRow, classes && classes.addRow);
				const select = ensureChild(addRow, ":scope > .je-input", () => el("select", "je-input"));
				select.replaceChildren();
				node.addOptions
					.forEach(
						(option) => {
							const opt = el("option", "", option.label);
							opt.value = option.kind === "other" ? "__other__" : option.key;
							select.appendChild(opt);
						}
					);
				const addBtn = ensureChild(addRow, ":scope > .je-add-btn", () => el("button", "je-add-btn", "Add field"));
				addBtn.type = "button";
				addBtn.disabled = false;
				attachAction(
					addBtn,
					"click",
					() => {
						const selectedKey = select.value;
						const option = node.addOptions.find((opt) => (opt.kind === "other"
							? "__other__"
							: opt.key) === selectedKey);
						if (!option) return
						if (option.kind === "other") {
							const name = window.prompt("Field name");
							if (!name) return
							node.addField(option, name);
						}
						else {
							node.addField(option);
						}
					}
				);
				applyClasses(addBtn, classes && classes.addButton);
				if (!body.contains(addRow)) body.appendChild(addRow);
			}
			let warn = node.missingRequired && node.missingRequired.length ? ensureChild(body, ":scope > .je-warn", () => el("div", "je-warn")) : body.querySelector(":scope > .je-warn");
			if (warn) {
				if (node.missingRequired && node.missingRequired.length) {
					warn.textContent = node.missingRequiredMessage || "";
					applyClasses(warn, classes && classes.warning);
				}
				else {
					body.removeChild(warn);
					warn = null;
				}
			}
			reconcileChildren(body, [...rows, ...(addRow ? [addRow] : []), ...(warn ? [warn] : [])]);
		}
		else if (body) {
			wrapper.removeChild(body);
		}
		return wrapper
	}
	function renderArray(node, existing, classes, ui) {
		const pathKey = pathToString(node.path);
		let wrapper = existing;
		if (!wrapper || wrapper.dataset.kind !== "array" || wrapper.dataset.path !== pathKey) {
			wrapper = el("div", "je-array");
			wrapper.dataset.kind = "array";
			wrapper.dataset.path = pathKey;
			applyClasses(wrapper, classes && classes.array);
		}
		const header = ensureChild(wrapper, ":scope > .je-header", () => el("div", "je-header"));
		applyClasses(header, classes && classes.header);
		const toggle = ensureChild(header, ":scope > .je-toggle", () => el("button", "je-toggle"));
		toggle.type = "button";
		toggle.textContent = node.collapsed ? "+" : "–";
		attachAction(
			toggle,
			"click",
			(event) => {
				if (event && event.shiftKey && node.setCollapsedDeep) {
					node.setCollapsedDeep(!node.collapsed);
				}
				else {
					node.toggle();
				}
			}
		);
		applyClasses(toggle, classes && classes.toggle);
		const title = ensureChild(header, ":scope > .je-title", () => el("div", "je-title"));
		title.textContent = node.title;
		applyClasses(title, classes && classes.title);
		const badge = ensureChild(header, ":scope > .je-badge", () => el("span", "je-badge"));
		badge.textContent = String(node.count);
		applyClasses(badge, classes && classes.badge);
		const doc = header.querySelector(":scope > .je-doc");
		if (doc) header.removeChild(doc);
		let body = wrapper.querySelector(":scope > .je-body");
		if (!node.collapsed) {
			if (!body) {
				body = el("div", "je-body");
				wrapper.appendChild(body);
			}
			applyClasses(body, classes && classes.body);
			const rowMap = new Map();
			Array.from(body
					.querySelectorAll(":scope > .je-row"))
				.forEach(
					(row) => {
						rowMap.set(Number(row.dataset.index), row);
					}
				);
			const rows = node.items
				.map(
					(item) => {
						let row = rowMap.get(item.index);
						if (!row) {
							row = el("div", "je-row je-array-row");
							row.dataset.index = String(item.index);
						}
						const parentKey = pathKey || "root";
						row.dataset.parent = parentKey;
						row.dataset.kind = "array";
						applyClasses(row, classes && classes.row);
						applyClasses(row, classes && classes.arrayRow);
						const icons = ensureChild(row, ":scope > .je-row-icons", () => el("div", "je-row-icons"));
						const remove = ensureChild(
							icons,
							":scope > .je-remove",
							() => {
								const btn = el("button", "je-remove je-icon-btn");
								btn.type = "button";
								btn.title = "Remove";
								return btn
							}
						);
						ensureIcon(remove, "remove");
						attachAction(remove, "click", () => item.remove());
						applyClasses(remove, classes && classes.remove);
						const handle = ensureChild(
							icons,
							":scope > .je-drag-handle",
							() => {
								const btn = el("button", "je-drag-handle je-icon-btn");
								btn.type = "button";
								btn.title = "Drag to reorder";
								return btn
							}
						);
						ensureIcon(handle, "drag");
						attachAction(
							handle,
							"pointerdown",
							(event) => {
								if (!ui || !ui.drag) return
								ui.drag
									.startDrag(
										event,
										{
											row,
											parentKey,
											kind: "array",
											moveTo: (toIndex) => {
												if (toIndex === item.index) return
												const bounded = Math.max(0, Math.min(toIndex, node.items.length - 1));
												item.moveTo(bounded);
											}
										}
									);
							}
						);
						const valueHost = ensureChild(row, ":scope > .je-value", () => el("div", "je-value"));
						applyClasses(valueHost, classes && classes.value);
						const currentChild = valueHost.firstElementChild;
						const nextChild = renderNode(item.node, currentChild, classes, ui);
						if (currentChild !== nextChild) {
							valueHost.replaceChildren(nextChild);
						}
						reconcileChildren(row, [icons, valueHost]);
						return row
					}
				);
			const addRow = ensureChild(body, ":scope > .je-add", () => el("div", "je-add"));
			applyClasses(addRow, classes && classes.addRow);
			let select = addRow.querySelector(":scope > .je-input");
			if (node.addOptions.length > 1) {
				if (!select) select = el("select", "je-input");
				select.replaceChildren();
				node.addOptions
					.forEach(
						(option, index) => {
							const opt = el("option", "", option.label);
							opt.value = String(index);
							select.appendChild(opt);
						}
					);
				if (!addRow.contains(select)) addRow.prepend(select);
			}
			else if (select) {
				addRow.removeChild(select);
				select = null;
			}
			const addBtn = ensureChild(addRow, ":scope > .je-add-btn", () => el("button", "je-add-btn", "Add item"));
			addBtn.type = "button";
			addBtn.disabled = node.addOptions.length === 0;
			attachAction(
				addBtn,
				"click",
				() => {
					const option = select ? node.addOptions[Number(select.value)] : node.addOptions[0];
					if (option) node.addItem(option);
				}
			);
			applyClasses(addBtn, classes && classes.addButton);
			reconcileChildren(body, [...rows, addRow]);
		}
		else if (body) {
			wrapper.removeChild(body);
		}
		return wrapper
	}
	function renderNode(node, existing, classes, ui) {
		if (!node) return el("div", "je-empty", "Empty")
		switch (node.kind) {
			case "object":
				return renderObject(node, existing, classes, ui)
			case "array":
				return renderArray(node, existing, classes, ui)
			case "field":
				return renderField(node, existing, classes)
			default:
				return el("div", "je-empty", "Unsupported")
		}
	}
	function createDomEditor({ container, value, schema, lenient = false, onChange, classes = null, onUpdate, defaultCollapsed = true, messages = null, messageResolver = null }) {
		if (!container) throw new Error("Container is required")
		const drag = createDragController(container);
		const editor = createEditorCore(
			{
				value,
				schema,
				lenient,
				onChange,
				onUpdate,
				defaultCollapsed,
				messages,
				messageResolver,
				onRender(tree) {
					const existing = container.firstElementChild;
					const next = renderNode(tree, existing, classes, { drag });
					if (existing !== next) {
						container.replaceChildren(next);
					}
				}
			}
		);
		return editor
	}
	function createEditor(options) {
		return createDomEditor(options)
	}

	exports.createDomEditor = createDomEditor;
	exports.createEditor = createEditor;
	exports.createEditorCore = createEditorCore;

}));
//# sourceMappingURL=editor.umd.js.map
