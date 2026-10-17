var RoxyUI_hd_connection=(()=>{var X=Object.defineProperty;var Ne=Object.getOwnPropertyDescriptor;var Ht=Object.getOwnPropertyNames;var jt=Object.prototype.hasOwnProperty;var Dt=(n,e)=>{for(var t in e)X(n,t,{get:e[t],enumerable:!0})},zt=(n,e,t,r)=>{if(e&&typeof e=="object"||typeof e=="function")for(let o of Ht(e))!jt.call(n,o)&&o!==t&&X(n,o,{get:()=>e[o],enumerable:!(r=Ne(e,o))||r.enumerable});return n};var Ft=n=>zt(X({},"__esModule",{value:!0}),n),f=(n,e,t,r)=>{for(var o=r>1?void 0:r?Ne(e,t):e,s=n.length-1,i;s>=0;s--)(i=n[s])&&(o=(r?i(e,t,o):i(o))||o);return r&&o&&X(e,t,o),o};var Mr={};Dt(Mr,{ROXY_UI_TOKENS_STYLE_ID:()=>J,RoxyHdConnection:()=>B,injectRoxyTokens:()=>Z});var Be=`/**
 * Roxy UI design tokens. 47 CSS custom properties that every component reads. Light + dark defaults. Host page overrides at :root or per element. No Tailwind, no class-name overrides, no JS theme switcher.
 *
 * Delivery model: this file ships as a global light-DOM stylesheet (linked, or auto-injected by the CDN bundle). Why every rule sits in a cascade layer is the note above the layer statement below. Custom properties inherit through the shadow boundary, so tokens set on a light-DOM ancestor reach every component shadow. The explicit theme blocks therefore target light-DOM selectors (:root, .dark, [data-theme="dark"], a wrapper element), NOT :host (a :host rule in a global sheet matches nothing). The :host([data-theme]) selectors are kept only for the case where this CSS is ever adopted directly into a shadow root; they are inert in global delivery.
 *
 * Light is the default. Dark applies under any of:
 *   - prefers-color-scheme: dark
 *   - [data-theme="dark"] on the element itself or any ancestor (typically :root)
 *   - .dark class on the element itself or any ancestor (typically :root)
 *
 * Explicit choice wins over the OS: the [data-theme] / .dark blocks come after the @media (prefers-color-scheme: dark) block in source order, and a closer ancestor overrides a farther one through normal custom-property inheritance.
 *
 * Motion gating:
 *   - --roxy-motion-duration defaults to 200ms. Set to 0ms to disable.
 *   - prefers-reduced-motion: reduce forces 0ms regardless of host overrides.
 */

/*
 * Two mechanisms keep the host page in charge of every token, and both are load bearing.
 *
 * The rules below sit in the \`roxy.tokens\` cascade layer, and an unlayered declaration beats a
 * layered one at ANY specificity. So a plain \`:root { --roxy-accent: #8b5cf6 }\` on the host page
 * wins, and so does the same line written inside a layer of its own, because the layer
 * statement above registers ours first and the CDN bundle injects this sheet at the top of
 * <head>. A host that links this file after its own CSS orders the layers itself:
 * \`@layer roxy, base, components, utilities;\` before either sheet.
 *
 * Every selector is ALSO wrapped in :where(), which has ZERO specificity, so a host declaration
 * still wins wherever a layer cannot decide it. Without that, \`:root.dark\` and
 * \`[data-theme="dark"]\` would carry class and attribute specificity (0,1,1) and outrank a plain
 * \`:root\` (0,1,0), and one brand override would hold under prefers-color-scheme and revert
 * under the other two dark signals: one line, three different results.
 *
 * Source order still decides among the rules in THIS file, which is what lets the explicit dark
 * block beat the light defaults when both match.
 */

/* Layer order, named here so it is fixed wherever the two files load: the theme presets in
 * styles/themes/*.css reassign tokens and must win over these defaults. Both files declare it,
 * so either one loading alone still orders the pair. */
@layer roxy.tokens, roxy.theme;

@layer roxy.tokens {
	:where(:root, :host) {
		/* Native controls follow the theme, and this is the ONLY thing that makes them.
		 *
		 * \`color-scheme\` is a real property, not the \`prefers-color-scheme\` query above it, and
		 * without it the browser paints every native control in its LIGHT appearance whatever our
		 * tokens say. A <select> looks fine closed, because we colour it ourselves, and then opens a
		 * light popup whose <option> rows inherit our near-white --roxy-fg: white text on white. The
		 * same omission dims a date or time picker's calendar, the number spinner, the autofill
		 * highlight and the scrollbar.
		 *
		 * It belongs HERE and not on the controls, because a per-control fix is one rule per input
		 * type per component, forever, and it still cannot reach the popup: that is rendered by the
		 * OS outside the DOM, so no selector we write applies to it. Declared once per theme trigger,
		 * beside the tokens, it covers every control in every component and on the host page.
		 * \`color-scheme\` is inherited, and these selectors match :host, so each shadow root gets it. */
		color-scheme: light;

		/* Color: brand */
		--roxy-primary: #0f172a;
		--roxy-secondary: #475569;
		--roxy-accent: #f59e0b;
		/* Text-safe accent variant, DERIVED from --roxy-accent so overriding the accent
		 * alone rebrands the whole library. Never hardcode a colour here: a consumer
		 * following the theming recipe sets only --roxy-accent, and a fixed value leaves
		 * the active tab label, the conjunction aspect lines and the focus ring on the
		 * old hue, giving a two-tone palette from a one-line override.
		 *
		 * The raw accent is too light for text (amber-500 is 2.14:1 on white, far under
		 * WCAG AA). Mixing 70% of it into black is measured, not guessed: rasterised to
		 * real pixels, the darkest of the twelve shipped domain accents still lands at
		 * 5.24:1 on white, above AA. At 75% amber falls to 4.46 and fails, so 70 is a
		 * ceiling, not a round number.
		 *
		 * Fills (planet glyphs, chart accents, non-text badges) keep --roxy-accent. */
		--roxy-accent-ink: color-mix(in oklab, var(--roxy-accent) 70%, black);

		/* Color: status. The base value (success, warning, danger, info) is for
		 * fills and tints. The -fg partner is the INK for a tint of that base, and it
		 * is DERIVED from it exactly as --roxy-accent-ink is derived from the accent,
		 * so re-pointing a status colour carries its text with it instead of leaving
		 * the old hue on every rule that reads the ink.
		 *
		 * 70 percent toward black is the ratio the accent already uses, and it is
		 * measured rather than chosen: rasterised to real pixels the four shipped
		 * pairs land between 7.4 and 9.8 to 1 on the card and between 6.5 and 8.1 on
		 * a 12 percent tint of their own base, every one of them above WCAG AA and at
		 * or above the fixed hexes they replace. Use -fg whenever status color hits
		 * text. */
		--roxy-success: #16a34a;
		--roxy-success-fg: color-mix(in oklab, var(--roxy-success) 70%, black);
		--roxy-warning: #ea580c;
		--roxy-warning-fg: color-mix(in oklab, var(--roxy-warning) 70%, black);
		--roxy-danger: #dc2626;
		--roxy-danger-fg: color-mix(in oklab, var(--roxy-danger) 70%, black);
		--roxy-info: #0284c7;
		--roxy-info-fg: color-mix(in oklab, var(--roxy-info) 70%, black);

		/* Color: surface */
		--roxy-bg: #ffffff;
		--roxy-surface: #ffffff;
		--roxy-fg: #0a0a0a;
		--roxy-muted: #71717a;
		--roxy-border: #e4e4e7;
		--roxy-ring: color-mix(in srgb, var(--roxy-accent) 40%, transparent);

		/* Typography */
		--roxy-font-sans:
			"Geist", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
			sans-serif;
		--roxy-font-mono:
			"Geist Mono", ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono",
			monospace;
		/* Heading/display font. Defaults to the sans stack so nothing changes for an
		 * existing consumer; a preset (the practitioner theme ships a serif) overrides
		 * it to restyle every result heading and the self-fetch form title in one token.
		 * Fonts do not vary by theme, so it is declared once here and inherited by the
		 * dark/light blocks unchanged. */
		--roxy-font-display: var(--roxy-font-sans);

		--roxy-text-xs: 0.75rem;
		--roxy-text-sm: 0.875rem;
		--roxy-text-base: 1rem;
		--roxy-text-lg: 1.125rem;
		--roxy-text-xl: 1.5rem;

		--roxy-weight-normal: 400;
		--roxy-weight-bold: 600;

		--roxy-leading-tight: 1.2;
		--roxy-leading-normal: 1.5;

		--roxy-tracking-tight: -0.02em;
		--roxy-tracking-normal: 0em;

		/* Spacing */
		--roxy-space-xs: 0.25rem;
		--roxy-space-sm: 0.5rem;
		--roxy-space-md: 1rem;
		--roxy-space-lg: 1.5rem;
		--roxy-space-xl: 2.5rem;

		/* Radius */
		--roxy-radius-sm: 4px;
		--roxy-radius-md: 8px;
		--roxy-radius-lg: 12px;
		--roxy-radius-full: 9999px;

		/* Shadow */
		--roxy-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.06);
		--roxy-shadow-md:
			0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.06);
		--roxy-shadow-lg: 0 12px 24px -8px rgba(0, 0, 0, 0.14);

		/* Motion */
		--roxy-motion-duration: 200ms;
		--roxy-motion-easing: cubic-bezier(0.4, 0, 0.2, 1);

		/* Heat scale: a single base hue. Consumers mix it with \`transparent\` at
		 * increasing percentages to paint cooler-to-hotter tiers. The mix-with-
		 * transparent approach lets the page bg show through and keeps text
		 * colour stable (always --roxy-fg), so the cells read in both themes
		 * without per-tier text colours. */
		--roxy-heat: var(--roxy-danger, #ef4444);
	}

	/* Dark theme via system preference */
	@media (prefers-color-scheme: dark) {
		:where(:root, :host) {
			color-scheme: dark;
			--roxy-primary: #f8fafc;
			--roxy-secondary: #94a3b8;
			--roxy-accent: #fbbf24;
			--roxy-accent-ink: var(--roxy-accent);

			/* The dark blocks mix toward WHITE, and BOTH dark triggers carry the line.
			 * Without it a visitor on system dark with no data-theme attribute inherits
			 * the light derivation, which lands a dark green on a near-black surface and
			 * fails WCAG AA. */
			--roxy-success: #22c55e;
			--roxy-success-fg: color-mix(in oklab, var(--roxy-success) 70%, white);
			--roxy-warning: #fb923c;
			--roxy-warning-fg: color-mix(in oklab, var(--roxy-warning) 70%, white);
			--roxy-danger: #ef4444;
			--roxy-danger-fg: color-mix(in oklab, var(--roxy-danger) 70%, white);
			--roxy-info: #38bdf8;
			--roxy-info-fg: color-mix(in oklab, var(--roxy-info) 70%, white);

			--roxy-bg: #0a0a0a;
			--roxy-surface: #18181b;
			--roxy-fg: #fafafa;
			--roxy-muted: #a1a1aa;
			--roxy-border: #27272a;
			--roxy-ring: color-mix(in srgb, var(--roxy-accent) 45%, transparent);

			--roxy-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.5);
			--roxy-shadow-md:
				0 4px 6px -1px rgba(0, 0, 0, 0.6), 0 2px 4px -2px rgba(0, 0, 0, 0.5);
			--roxy-shadow-lg: 0 12px 24px -8px rgba(0, 0, 0, 0.7);

			--roxy-heat: var(--roxy-danger, #ef4444);
		}
	}

	/* Light theme override. Beats the @media (prefers-color-scheme: dark) block
	 * when the host explicitly opts back into light. Without this, a dark-mode OS
	 * pins the tokens to dark even after data-theme="light" is set. The light-DOM
	 * selectors (:root.light, .light, [data-theme="light"]) set the vars on the
	 * ancestor or the element itself so they inherit into every component shadow;
	 * :host([data-theme="light"]) is inert in global delivery and kept only for
	 * shadow-adopted use. */
	:where(
		:root[data-theme="light"],
		[data-theme="light"],
		:root.light,
		.light,
		:host([data-theme="light"])
	) {
		color-scheme: light;
		--roxy-primary: #0f172a;
		--roxy-secondary: #475569;
		--roxy-accent: #f59e0b;
		--roxy-accent-ink: color-mix(in oklab, var(--roxy-accent) 70%, black);

		--roxy-success: #16a34a;
		--roxy-success-fg: color-mix(in oklab, var(--roxy-success) 70%, black);
		--roxy-warning: #ea580c;
		--roxy-warning-fg: color-mix(in oklab, var(--roxy-warning) 70%, black);
		--roxy-danger: #dc2626;
		--roxy-danger-fg: color-mix(in oklab, var(--roxy-danger) 70%, black);
		--roxy-info: #0284c7;
		--roxy-info-fg: color-mix(in oklab, var(--roxy-info) 70%, black);

		--roxy-bg: #ffffff;
		--roxy-surface: #ffffff;
		--roxy-fg: #0a0a0a;
		--roxy-muted: #71717a;
		--roxy-border: #e4e4e7;
		--roxy-ring: color-mix(in srgb, var(--roxy-accent) 40%, transparent);

		--roxy-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.06);
		--roxy-shadow-md:
			0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.06);
		--roxy-shadow-lg: 0 12px 24px -8px rgba(0, 0, 0, 0.14);
	}

	/* Dark theme via explicit opt-in. The light-DOM selectors (:root.dark, .dark,
	 * [data-theme="dark"]) set the vars on the ancestor or the element itself so
	 * they inherit into every component shadow; this is what makes a .dark class on
	 * any ancestor (Tailwind, shadcn) actually theme the components in global
	 * delivery. :host([data-theme="dark"]) is inert in global delivery and kept
	 * only for shadow-adopted use. */
	:where(
		:root[data-theme="dark"],
		[data-theme="dark"],
		:root.dark,
		.dark,
		:host([data-theme="dark"])
	) {
		color-scheme: dark;
		--roxy-primary: #f8fafc;
		--roxy-secondary: #94a3b8;
		--roxy-accent: #fbbf24;
		--roxy-accent-ink: var(--roxy-accent);

		--roxy-success: #22c55e;
		--roxy-success-fg: color-mix(in oklab, var(--roxy-success) 70%, white);
		--roxy-warning: #fb923c;
		--roxy-warning-fg: color-mix(in oklab, var(--roxy-warning) 70%, white);
		--roxy-danger: #ef4444;
		--roxy-danger-fg: color-mix(in oklab, var(--roxy-danger) 70%, white);
		--roxy-info: #38bdf8;
		--roxy-info-fg: color-mix(in oklab, var(--roxy-info) 70%, white);

		--roxy-bg: #0a0a0a;
		--roxy-surface: #18181b;
		--roxy-fg: #fafafa;
		--roxy-muted: #a1a1aa;
		--roxy-border: #27272a;
		--roxy-ring: color-mix(in srgb, var(--roxy-accent) 45%, transparent);

		--roxy-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.5);
		--roxy-shadow-md:
			0 4px 6px -1px rgba(0, 0, 0, 0.6), 0 2px 4px -2px rgba(0, 0, 0, 0.5);
		--roxy-shadow-lg: 0 12px 24px -8px rgba(0, 0, 0, 0.7);

		--roxy-heat: var(--roxy-danger, #ef4444);
	}

	/* Reduced motion override */
	@media (prefers-reduced-motion: reduce) {
		:where(:root, :host) {
			--roxy-motion-duration: 0ms;
		}
	}
}
`;var J="roxy-ui-tokens";function Z(){if(typeof document>"u")return null;let n=document.getElementById(J);if(n)return n;let e=document.createElement("style");return e.id=J,e.textContent=Be,document.head.prepend(e),e}var Q=globalThis,ee=Q.ShadowRoot&&(Q.ShadyCSS===void 0||Q.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,ge=Symbol(),He=new WeakMap,H=class{constructor(e,t,r){if(this._$cssResult$=!0,r!==ge)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=e,this.t=t}get styleSheet(){let e=this.o,t=this.t;if(ee&&e===void 0){let r=t!==void 0&&t.length===1;r&&(e=He.get(t)),e===void 0&&((this.o=e=new CSSStyleSheet).replaceSync(this.cssText),r&&He.set(t,e))}return e}toString(){return this.cssText}},je=n=>new H(typeof n=="string"?n:n+"",void 0,ge),b=(n,...e)=>{let t=n.length===1?n[0]:e.reduce((r,o,s)=>r+(i=>{if(i._$cssResult$===!0)return i.cssText;if(typeof i=="number")return i;throw Error("Value passed to 'css' function must be a 'css' function result: "+i+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(o)+n[s+1],n[0]);return new H(t,n,ge)},De=(n,e)=>{if(ee)n.adoptedStyleSheets=e.map(t=>t instanceof CSSStyleSheet?t:t.styleSheet);else for(let t of e){let r=document.createElement("style"),o=Q.litNonce;o!==void 0&&r.setAttribute("nonce",o),r.textContent=t.cssText,n.appendChild(r)}},ye=ee?n=>n:n=>n instanceof CSSStyleSheet?(e=>{let t="";for(let r of e.cssRules)t+=r.cssText;return je(t)})(n):n;var{is:Gt,defineProperty:Kt,getOwnPropertyDescriptor:qt,getOwnPropertyNames:Wt,getOwnPropertySymbols:Yt,getPrototypeOf:Vt}=Object,te=globalThis,ze=te.trustedTypes,Xt=ze?ze.emptyScript:"",Jt=te.reactiveElementPolyfillSupport,j=(n,e)=>n,D={toAttribute(n,e){switch(e){case Boolean:n=n?Xt:null;break;case Object:case Array:n=n==null?n:JSON.stringify(n)}return n},fromAttribute(n,e){let t=n;switch(e){case Boolean:t=n!==null;break;case Number:t=n===null?null:Number(n);break;case Object:case Array:try{t=JSON.parse(n)}catch{t=null}}return t}},re=(n,e)=>!Gt(n,e),Fe={attribute:!0,type:String,converter:D,reflect:!1,useDefault:!1,hasChanged:re};Symbol.metadata??=Symbol("metadata"),te.litPropertyMetadata??=new WeakMap;var A=class extends HTMLElement{static addInitializer(e){this._$Ei(),(this.l??=[]).push(e)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(e,t=Fe){if(t.state&&(t.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(e)&&((t=Object.create(t)).wrapped=!0),this.elementProperties.set(e,t),!t.noAccessor){let r=Symbol(),o=this.getPropertyDescriptor(e,r,t);o!==void 0&&Kt(this.prototype,e,o)}}static getPropertyDescriptor(e,t,r){let{get:o,set:s}=qt(this.prototype,e)??{get(){return this[t]},set(i){this[t]=i}};return{get:o,set(i){let l=o?.call(this);s?.call(this,i),this.requestUpdate(e,l,r)},configurable:!0,enumerable:!0}}static getPropertyOptions(e){return this.elementProperties.get(e)??Fe}static _$Ei(){if(this.hasOwnProperty(j("elementProperties")))return;let e=Vt(this);e.finalize(),e.l!==void 0&&(this.l=[...e.l]),this.elementProperties=new Map(e.elementProperties)}static finalize(){if(this.hasOwnProperty(j("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(j("properties"))){let t=this.properties,r=[...Wt(t),...Yt(t)];for(let o of r)this.createProperty(o,t[o])}let e=this[Symbol.metadata];if(e!==null){let t=litPropertyMetadata.get(e);if(t!==void 0)for(let[r,o]of t)this.elementProperties.set(r,o)}this._$Eh=new Map;for(let[t,r]of this.elementProperties){let o=this._$Eu(t,r);o!==void 0&&this._$Eh.set(o,t)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(e){let t=[];if(Array.isArray(e)){let r=new Set(e.flat(1/0).reverse());for(let o of r)t.unshift(ye(o))}else e!==void 0&&t.push(ye(e));return t}static _$Eu(e,t){let r=t.attribute;return r===!1?void 0:typeof r=="string"?r:typeof e=="string"?e.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){this._$ES=new Promise(e=>this.enableUpdating=e),this._$AL=new Map,this._$E_(),this.requestUpdate(),this.constructor.l?.forEach(e=>e(this))}addController(e){(this._$EO??=new Set).add(e),this.renderRoot!==void 0&&this.isConnected&&e.hostConnected?.()}removeController(e){this._$EO?.delete(e)}_$E_(){let e=new Map,t=this.constructor.elementProperties;for(let r of t.keys())this.hasOwnProperty(r)&&(e.set(r,this[r]),delete this[r]);e.size>0&&(this._$Ep=e)}createRenderRoot(){let e=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return De(e,this.constructor.elementStyles),e}connectedCallback(){this.renderRoot??=this.createRenderRoot(),this.enableUpdating(!0),this._$EO?.forEach(e=>e.hostConnected?.())}enableUpdating(e){}disconnectedCallback(){this._$EO?.forEach(e=>e.hostDisconnected?.())}attributeChangedCallback(e,t,r){this._$AK(e,r)}_$ET(e,t){let r=this.constructor.elementProperties.get(e),o=this.constructor._$Eu(e,r);if(o!==void 0&&r.reflect===!0){let s=(r.converter?.toAttribute!==void 0?r.converter:D).toAttribute(t,r.type);this._$Em=e,s==null?this.removeAttribute(o):this.setAttribute(o,s),this._$Em=null}}_$AK(e,t){let r=this.constructor,o=r._$Eh.get(e);if(o!==void 0&&this._$Em!==o){let s=r.getPropertyOptions(o),i=typeof s.converter=="function"?{fromAttribute:s.converter}:s.converter?.fromAttribute!==void 0?s.converter:D;this._$Em=o;let l=i.fromAttribute(t,s.type);this[o]=l??this._$Ej?.get(o)??l,this._$Em=null}}requestUpdate(e,t,r,o=!1,s){if(e!==void 0){let i=this.constructor;if(o===!1&&(s=this[e]),r??=i.getPropertyOptions(e),!((r.hasChanged??re)(s,t)||r.useDefault&&r.reflect&&s===this._$Ej?.get(e)&&!this.hasAttribute(i._$Eu(e,r))))return;this.C(e,t,r)}this.isUpdatePending===!1&&(this._$ES=this._$EP())}C(e,t,{useDefault:r,reflect:o,wrapped:s},i){r&&!(this._$Ej??=new Map).has(e)&&(this._$Ej.set(e,i??t??this[e]),s!==!0||i!==void 0)||(this._$AL.has(e)||(this.hasUpdated||r||(t=void 0),this._$AL.set(e,t)),o===!0&&this._$Em!==e&&(this._$Eq??=new Set).add(e))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(t){Promise.reject(t)}let e=this.scheduleUpdate();return e!=null&&await e,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??=this.createRenderRoot(),this._$Ep){for(let[o,s]of this._$Ep)this[o]=s;this._$Ep=void 0}let r=this.constructor.elementProperties;if(r.size>0)for(let[o,s]of r){let{wrapped:i}=s,l=this[o];i!==!0||this._$AL.has(o)||l===void 0||this.C(o,void 0,s,l)}}let e=!1,t=this._$AL;try{e=this.shouldUpdate(t),e?(this.willUpdate(t),this._$EO?.forEach(r=>r.hostUpdate?.()),this.update(t)):this._$EM()}catch(r){throw e=!1,this._$EM(),r}e&&this._$AE(t)}willUpdate(e){}_$AE(e){this._$EO?.forEach(t=>t.hostUpdated?.()),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(e)),this.updated(e)}_$EM(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(e){return!0}update(e){this._$Eq&&=this._$Eq.forEach(t=>this._$ET(t,this[t])),this._$EM()}updated(e){}firstUpdated(e){}};A.elementStyles=[],A.shadowRootOptions={mode:"open"},A[j("elementProperties")]=new Map,A[j("finalized")]=new Map,Jt?.({ReactiveElement:A}),(te.reactiveElementVersions??=[]).push("2.1.2");var Ae=globalThis,Ge=n=>n,ne=Ae.trustedTypes,Ke=ne?ne.createPolicy("lit-html",{createHTML:n=>n}):void 0,Je="$lit$",C=`lit$${Math.random().toFixed(9).slice(2)}$`,Ze="?"+C,Zt=`<${Ze}>`,O=document,F=()=>O.createComment(""),G=n=>n===null||typeof n!="object"&&typeof n!="function",Se=Array.isArray,Qt=n=>Se(n)||typeof n?.[Symbol.iterator]=="function",xe=`[ 	
\f\r]`,z=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,qe=/-->/g,We=/>/g,E=RegExp(`>|${xe}(?:([^\\s"'>=/]+)(${xe}*=${xe}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`,"g"),Ye=/'/g,Ve=/"/g,Qe=/^(?:script|style|textarea|title)$/i,_e=n=>(e,...t)=>({_$litType$:n,strings:e,values:t}),u=_e(1),v=_e(2),Kr=_e(3),P=Symbol.for("lit-noChange"),d=Symbol.for("lit-nothing"),Xe=new WeakMap,T=O.createTreeWalker(O,129);function et(n,e){if(!Se(n)||!n.hasOwnProperty("raw"))throw Error("invalid template strings array");return Ke!==void 0?Ke.createHTML(e):e}var er=(n,e)=>{let t=n.length-1,r=[],o,s=e===2?"<svg>":e===3?"<math>":"",i=z;for(let l=0;l<t;l++){let a=n[l],h,p,g=-1,k=0;for(;k<a.length&&(i.lastIndex=k,p=i.exec(a),p!==null);)k=i.lastIndex,i===z?p[1]==="!--"?i=qe:p[1]!==void 0?i=We:p[2]!==void 0?(Qe.test(p[2])&&(o=RegExp("</"+p[2],"g")),i=E):p[3]!==void 0&&(i=E):i===E?p[0]===">"?(i=o??z,g=-1):p[1]===void 0?g=-2:(g=i.lastIndex-p[2].length,h=p[1],i=p[3]===void 0?E:p[3]==='"'?Ve:Ye):i===Ve||i===Ye?i=E:i===qe||i===We?i=z:(i=E,o=void 0);let _=i===E&&n[l+1].startsWith("/>")?" ":"";s+=i===z?a+Zt:g>=0?(r.push(h),a.slice(0,g)+Je+a.slice(g)+C+_):a+C+(g===-2?l:_)}return[et(n,s+(n[t]||"<?>")+(e===2?"</svg>":e===3?"</math>":"")),r]},K=class n{constructor({strings:e,_$litType$:t},r){let o;this.parts=[];let s=0,i=0,l=e.length-1,a=this.parts,[h,p]=er(e,t);if(this.el=n.createElement(h,r),T.currentNode=this.el.content,t===2||t===3){let g=this.el.content.firstChild;g.replaceWith(...g.childNodes)}for(;(o=T.nextNode())!==null&&a.length<l;){if(o.nodeType===1){if(o.hasAttributes())for(let g of o.getAttributeNames())if(g.endsWith(Je)){let k=p[i++],_=o.getAttribute(g).split(C),V=/([.?@])?(.*)/.exec(k);a.push({type:1,index:s,name:V[2],strings:_,ctor:V[1]==="."?ve:V[1]==="?"?we:V[1]==="@"?$e:N}),o.removeAttribute(g)}else g.startsWith(C)&&(a.push({type:6,index:s}),o.removeAttribute(g));if(Qe.test(o.tagName)){let g=o.textContent.split(C),k=g.length-1;if(k>0){o.textContent=ne?ne.emptyScript:"";for(let _=0;_<k;_++)o.append(g[_],F()),T.nextNode(),a.push({type:2,index:++s});o.append(g[k],F())}}}else if(o.nodeType===8)if(o.data===Ze)a.push({type:2,index:s});else{let g=-1;for(;(g=o.data.indexOf(C,g+1))!==-1;)a.push({type:7,index:s}),g+=C.length-1}s++}}static createElement(e,t){let r=O.createElement("template");return r.innerHTML=e,r}};function M(n,e,t=n,r){if(e===P)return e;let o=r!==void 0?t._$Co?.[r]:t._$Cl,s=G(e)?void 0:e._$litDirective$;return o?.constructor!==s&&(o?._$AO?.(!1),s===void 0?o=void 0:(o=new s(n),o._$AT(n,t,r)),r!==void 0?(t._$Co??=[])[r]=o:t._$Cl=o),o!==void 0&&(e=M(n,o._$AS(n,e.values),o,r)),e}var be=class{constructor(e,t){this._$AV=[],this._$AN=void 0,this._$AD=e,this._$AM=t}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(e){let{el:{content:t},parts:r}=this._$AD,o=(e?.creationScope??O).importNode(t,!0);T.currentNode=o;let s=T.nextNode(),i=0,l=0,a=r[0];for(;a!==void 0;){if(i===a.index){let h;a.type===2?h=new q(s,s.nextSibling,this,e):a.type===1?h=new a.ctor(s,a.name,a.strings,this,e):a.type===6&&(h=new ke(s,this,e)),this._$AV.push(h),a=r[++l]}i!==a?.index&&(s=T.nextNode(),i++)}return T.currentNode=O,o}p(e){let t=0;for(let r of this._$AV)r!==void 0&&(r.strings!==void 0?(r._$AI(e,r,t),t+=r.strings.length-2):r._$AI(e[t])),t++}},q=class n{get _$AU(){return this._$AM?._$AU??this._$Cv}constructor(e,t,r,o){this.type=2,this._$AH=d,this._$AN=void 0,this._$AA=e,this._$AB=t,this._$AM=r,this.options=o,this._$Cv=o?.isConnected??!0}get parentNode(){let e=this._$AA.parentNode,t=this._$AM;return t!==void 0&&e?.nodeType===11&&(e=t.parentNode),e}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(e,t=this){e=M(this,e,t),G(e)?e===d||e==null||e===""?(this._$AH!==d&&this._$AR(),this._$AH=d):e!==this._$AH&&e!==P&&this._(e):e._$litType$!==void 0?this.$(e):e.nodeType!==void 0?this.T(e):Qt(e)?this.k(e):this._(e)}O(e){return this._$AA.parentNode.insertBefore(e,this._$AB)}T(e){this._$AH!==e&&(this._$AR(),this._$AH=this.O(e))}_(e){this._$AH!==d&&G(this._$AH)?this._$AA.nextSibling.data=e:this.T(O.createTextNode(e)),this._$AH=e}$(e){let{values:t,_$litType$:r}=e,o=typeof r=="number"?this._$AC(e):(r.el===void 0&&(r.el=K.createElement(et(r.h,r.h[0]),this.options)),r);if(this._$AH?._$AD===o)this._$AH.p(t);else{let s=new be(o,this),i=s.u(this.options);s.p(t),this.T(i),this._$AH=s}}_$AC(e){let t=Xe.get(e.strings);return t===void 0&&Xe.set(e.strings,t=new K(e)),t}k(e){Se(this._$AH)||(this._$AH=[],this._$AR());let t=this._$AH,r,o=0;for(let s of e)o===t.length?t.push(r=new n(this.O(F()),this.O(F()),this,this.options)):r=t[o],r._$AI(s),o++;o<t.length&&(this._$AR(r&&r._$AB.nextSibling,o),t.length=o)}_$AR(e=this._$AA.nextSibling,t){for(this._$AP?.(!1,!0,t);e!==this._$AB;){let r=Ge(e).nextSibling;Ge(e).remove(),e=r}}setConnected(e){this._$AM===void 0&&(this._$Cv=e,this._$AP?.(e))}},N=class{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(e,t,r,o,s){this.type=1,this._$AH=d,this._$AN=void 0,this.element=e,this.name=t,this._$AM=o,this.options=s,r.length>2||r[0]!==""||r[1]!==""?(this._$AH=Array(r.length-1).fill(new String),this.strings=r):this._$AH=d}_$AI(e,t=this,r,o){let s=this.strings,i=!1;if(s===void 0)e=M(this,e,t,0),i=!G(e)||e!==this._$AH&&e!==P,i&&(this._$AH=e);else{let l=e,a,h;for(e=s[0],a=0;a<s.length-1;a++)h=M(this,l[r+a],t,a),h===P&&(h=this._$AH[a]),i||=!G(h)||h!==this._$AH[a],h===d?e=d:e!==d&&(e+=(h??"")+s[a+1]),this._$AH[a]=h}i&&!o&&this.j(e)}j(e){e===d?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,e??"")}},ve=class extends N{constructor(){super(...arguments),this.type=3}j(e){this.element[this.name]=e===d?void 0:e}},we=class extends N{constructor(){super(...arguments),this.type=4}j(e){this.element.toggleAttribute(this.name,!!e&&e!==d)}},$e=class extends N{constructor(e,t,r,o,s){super(e,t,r,o,s),this.type=5}_$AI(e,t=this){if((e=M(this,e,t,0)??d)===P)return;let r=this._$AH,o=e===d&&r!==d||e.capture!==r.capture||e.once!==r.once||e.passive!==r.passive,s=e!==d&&(r===d||o);o&&this.element.removeEventListener(this.name,this,r),s&&this.element.addEventListener(this.name,this,e),this._$AH=e}handleEvent(e){typeof this._$AH=="function"?this._$AH.call(this.options?.host??this.element,e):this._$AH.handleEvent(e)}},ke=class{constructor(e,t,r){this.element=e,this.type=6,this._$AN=void 0,this._$AM=t,this.options=r}get _$AU(){return this._$AM._$AU}_$AI(e){M(this,e)}};var tr=Ae.litHtmlPolyfillSupport;tr?.(K,q),(Ae.litHtmlVersions??=[]).push("3.3.3");var tt=(n,e,t)=>{let r=t?.renderBefore??e,o=r._$litPart$;if(o===void 0){let s=t?.renderBefore??null;r._$litPart$=o=new q(e.insertBefore(F(),s),s,void 0,t??{})}return o._$AI(n),o};var Ce=globalThis,R=class extends A{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){let e=super.createRenderRoot();return this.renderOptions.renderBefore??=e.firstChild,e}update(e){let t=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(e),this._$Do=tt(t,this.renderRoot,this.renderOptions)}connectedCallback(){super.connectedCallback(),this._$Do?.setConnected(!0)}disconnectedCallback(){super.disconnectedCallback(),this._$Do?.setConnected(!1)}render(){return P}};R._$litElement$=!0,R.finalized=!0,Ce.litElementHydrateSupport?.({LitElement:R});var rr=Ce.litElementPolyfillSupport;rr?.({LitElement:R});(Ce.litElementVersions??=[]).push("4.2.2");var rt=n=>(e,t)=>{t!==void 0?t.addInitializer(()=>{customElements.define(n,e)}):customElements.define(n,e)};var nr={attribute:!0,type:String,converter:D,reflect:!1,hasChanged:re},or=(n=nr,e,t)=>{let{kind:r,metadata:o}=t,s=globalThis.litPropertyMetadata.get(o);if(s===void 0&&globalThis.litPropertyMetadata.set(o,s=new Map),r==="setter"&&((n=Object.create(n)).wrapped=!0),s.set(t.name,n),r==="accessor"){let{name:i}=t;return{set(l){let a=e.get.call(this);e.set.call(this,l),this.requestUpdate(i,a,n,!0,l)},init(l){return l!==void 0&&this.C(i,void 0,n,l),l}}}if(r==="setter"){let{name:i}=t;return function(l){let a=this[i];e.call(this,l),this.requestUpdate(i,a,n,!0,l)}}throw Error("Unsupported decorator location: "+r)};function x(n){return(e,t)=>typeof t=="object"?or(n,e,t):((r,o,s)=>{let i=o.hasOwnProperty(s);return o.constructor.createProperty(s,r),i?Object.getOwnPropertyDescriptor(o,s):void 0})(n,e,t)}function $(n){return x({...n,state:!0,attribute:!1})}var L=n=>n??d;var nt=["de","en","es","fr","hi","pt","ru","tr","zh-Hans","zh-Hant"];function Ee(n){if(n.lang)return n.lang;if(typeof document>"u")return;let e=n.closest?.("[lang]")?.getAttribute("lang");return e||document.documentElement.lang||void 0}var sr={tw:"hant",hk:"hant",mo:"hant",cn:"hans",sg:"hans",my:"hans"};function Re(n){let e=n.toLowerCase();return nt.find(t=>t.toLowerCase()===e)}function ot(n){let e=Ee(n);if(!e)return;let t=Re(e);if(t)return t;let r=e.toLowerCase().split("-"),o=r[0];if(o==="zh"){let s=r.find(i=>i==="hans"||i==="hant")??sr[r[1]??""];return s?Re(`zh-${s}`):void 0}return Re(o)}function st(n){return n.toLowerCase().replace(/[\s_-]+/g," ").trim()}function se(n){return n.replace(/[_-]+/g," ").replace(/([a-z])([A-Z])/g,"$1 $2").replace(/([a-z])([0-9])/g,"$1 $2").replace(/^\w/,e=>e.toUpperCase())}var it="__ROXY_UI_I18N__";function lt(){let n=globalThis,e=n[it];if(e)return e;let t={catalogs:{},fieldLabels:{},requested:new Set,listeners:new Set};return n[it]=t,t}function at(n,e){return e?n.replace(/\{\{(\w+)\}\}/g,(t,r)=>r in e?String(e[r]??""):t):n}function ct(n,e,t){if(!n)return at(e,t);let{catalogs:r}=lt(),o=n.toLowerCase(),s=r[o]??r[o.split("-")[0]];return at(s?.[st(e)]??e,t)}function dt(n){let{listeners:e}=lt();return e.add(n),()=>{e.delete(n)}}var ie=class{constructor(e){this.host=e,e.addController(this)}hostConnected(){this.unsubscribe=dt(()=>this.host.requestUpdate())}hostDisconnected(){this.unsubscribe?.(),this.unsubscribe=void 0}};var ae=class extends R{constructor(){super();this.translator=(t,r)=>this.t(t,r);new ie(this)}t(t,r){return ct(this.effectiveLang(),t,r)}effectiveLang(){return Ee(this)}};var le=b`:host{--roxy-label-col:minmax(0, 25%);font-family:var(--roxy-font-sans,system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);color:var(--roxy-fg,#0a0a0a);font-size:var(--roxy-text-base,1rem);line-height:var(--roxy-leading-normal,1.5);animation:roxy-fade-in var(--roxy-motion-duration,.2s) var(--roxy-motion-easing,cubic-bezier(.4, 0, .2, 1)) both;background:0 0;display:block;container-type:inline-size}:host([hidden]){display:none}:host([bare]){--roxy-surface:transparent;--roxy-shadow-sm:none;--roxy-shadow-md:none}*,:before,:after{box-sizing:border-box}h1,h2,h3,h4{font-family:var(--roxy-font-display,var(--roxy-font-sans,system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif))}@keyframes roxy-fade-in{0%{transform:translateY(2px)}to{transform:translateY(0)}}@media (prefers-reduced-motion:reduce){:host{animation:none}}.roxy-skeleton{background:linear-gradient(90deg, var(--roxy-border,#e4e4e7) 0%, color-mix(in srgb, var(--roxy-border,#e4e4e7) 60%, transparent) 50%, var(--roxy-border,#e4e4e7) 100%);border-radius:var(--roxy-radius-md,8px);background-size:200% 100%;animation:1.4s ease-in-out infinite roxy-shimmer}@keyframes roxy-shimmer{0%{background-position:200% 0}to{background-position:-200% 0}}@media (prefers-reduced-motion:reduce){.roxy-skeleton{animation:none}}.roxy-sr-only{clip-path:inset(50%);white-space:nowrap;border:0;width:1px;height:1px;margin:0;padding:0;position:absolute;overflow:hidden}.roxy-empty{padding:var(--roxy-space-lg,1.5rem);color:var(--roxy-muted,#71717a);text-align:center;font-size:var(--roxy-text-sm,.875rem)}.roxy-error{gap:var(--roxy-space-sm,.5rem);padding:var(--roxy-space-lg,1.5rem);background:var(--roxy-surface,#fff);border:1px solid var(--roxy-danger,#dc2626);border-radius:var(--roxy-radius-md,8px);color:var(--roxy-danger-fg,#991b1b);font-size:var(--roxy-text-sm,.875rem);justify-items:start;display:grid}:host(:focus-within) .roxy-card{outline:2px solid var(--roxy-ring,#f59e0b66);outline-offset:2px}.roxy-attribution{margin-top:var(--roxy-space-sm,.5rem);font-size:var(--roxy-text-xs,.75rem);color:var(--roxy-muted,#71717a);text-align:right}.roxy-attribution a{color:inherit;text-decoration:none}.roxy-attribution a:hover{color:var(--roxy-accent-ink,#b45309);text-decoration:underline}.roxy-attribution a:focus-visible{outline:2px solid var(--roxy-ring,#f59e0b66);outline-offset:2px}.roxy-edit-bar{margin-bottom:var(--roxy-space-sm,.5rem);justify-content:flex-end;display:flex}.roxy-edit{padding:var(--roxy-space-xs,.25rem) var(--roxy-space-md,1rem);border:1px solid var(--roxy-border,#e4e4e7);border-radius:var(--roxy-radius-md,8px);color:var(--roxy-fg,#0a0a0a);font-family:inherit;font-size:var(--roxy-text-sm,.875rem);cursor:pointer;background:0 0}.roxy-edit:hover{border-color:var(--roxy-accent,#f59e0b);color:var(--roxy-accent-ink,#b45309)}.roxy-edit:focus-visible{outline:2px solid var(--roxy-ring,#f59e0b66);outline-offset:2px}.roxy-edit:disabled{cursor:progress;color:var(--roxy-muted,#71717a)}roxy-endpoint-form+*{margin-top:var(--roxy-space-md,1rem)}.roxy-more{justify-items:center;gap:var(--roxy-space-sm,.5rem);margin-top:var(--roxy-space-md,1rem);display:grid}.roxy-more .roxy-edit{min-height:44px}:host{font-variant-emoji:text}`;var ir="__cols",ar="__rows";function lr(n){return typeof n=="object"&&n!==null&&!Array.isArray(n)}function ce(n){if(Array.isArray(n)){let s=!1,i=n.map(l=>{let a=ce(l);return a!==l&&(s=!0),a});return s?i:n}if(!lr(n))return n;let e=n[ir],t=n[ar];if(Array.isArray(e)&&Array.isArray(t)&&Object.keys(n).length===2)return t.map(s=>{let i={};return e.forEach((l,a)=>{i[l]=ce(s[a])}),i});let r=!1,o={};for(let[s,i]of Object.entries(n)){let l=ce(i);l!==i&&(r=!0),o[s]=l}return r?o:n}function ht(n){return ce(n)}var cr="pk_live_YOUR_KEY",pt={secret:{reason:"possible-secret-key",message:"Client-side components accept a pk_ publishable key only. Use a publishable key with an origin allowlist, or render server-side."},sample:{reason:"sample-key",message:"Replace the sample key with your own publishable key from your RoxyAPI account."}};function ut(n){if(n)return n===cr?pt.sample:n.startsWith("pk_")?void 0:pt.secret}function mt(n,e,t={}){t.warn&&console.warn(e.message),n.dispatchEvent(new CustomEvent("roxy-validation-error",{detail:{reason:e.reason,message:e.message},bubbles:!0,composed:!0}))}var ft="https://roxyapi.com/api/v2";async function dr(n){try{let e=await n.json();if(e?.error){let t=e.code==="validation_error"&&Array.isArray(e.issues)?e.issues.filter(r=>typeof r.path=="string"&&typeof r.message=="string").map(r=>({path:r.path,message:r.message})):null;return{message:e.error,issues:t?.length?t:null}}}catch{}return{message:`Request failed (${n.status})`,issues:null}}var W=class extends Error{constructor(t,r=null){super(t);this.issues=r}};function gt(n){return n.submitUrl?void 0:ut(n.publishableKey)}async function Te(n,e,t){let r=gt(n);if(r)throw new W(r.message);let o=n.submitUrl?await fetch(n.submitUrl,{method:"POST",headers:{Accept:"application/json","Content-Type":"application/json"},body:hr(e,n.submitContext),signal:t}):await pr(n,e,t);if(!o.ok){let s=await dr(o);throw new W(s.message,s.issues)}return await o.json()}function hr(n,e){return JSON.stringify(e?{...n,context:e}:n)}function pr(n,e,t){let r=new URL(`${n.baseUrl??ft}${e.path}`,document.baseURI);for(let[s,i]of Object.entries(e.query??{}))i!=null&&r.searchParams.set(s,String(i));let o={Accept:"application/json"};return n.publishableKey&&(o["X-API-Key"]=n.publishableKey),e.body!=null&&(o["Content-Type"]="application/json"),fetch(r,{method:e.method??"GET",headers:o,body:e.body!=null?JSON.stringify(e.body):void 0,signal:t})}var de=class{constructor(e){this.baseUrl=ft;this.host=e,e.addController(this)}hostDisconnected(){this.abort?.abort(),this.abort=void 0}async run(e){let t=gt(this);if(t){this.host.error=t.message,mt(this.host,t);return}this.abort?.abort();let r=new AbortController;this.abort=r,this.host.loading=!0,this.host.error=null,this.host.issues=null;try{let o=await Te(this,e,r.signal);if(r.signal.aborted)return;this.host.data=o}catch(o){if(r.signal.aborted||o?.name==="AbortError")return;o instanceof W&&(this.host.issues=o.issues),this.host.error=o instanceof Error?o.message:String(o)}finally{this.abort===r&&(this.abort=void 0),r.signal.aborted||(this.host.loading=!1)}}};function yt(n,e,t,r=[]){let o={...t},s=`/${n.replace(/^\//,"")}`.replace(/\{([^}]+)\}/g,(h,p)=>{let g=o[p];return delete o[p],encodeURIComponent(String(g??""))}),i=new Set(r),l={},a={};for(let[h,p]of Object.entries(o))p===void 0||p===""||(e==="GET"||i.has(h)?l[h]=p:a[h]=p);return{path:s,method:e,query:l,body:e==="POST"?a:void 0}}function xt(){return u`<svg class="roxy-chevron" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`}var bt=b`summary{list-style:none}summary::-webkit-details-marker{display:none}.roxy-chevron{aspect-ratio:auto;width:14px;height:14px;color:var(--roxy-muted,#71717a);transition:transform var(--roxy-motion-duration,.2s) var(--roxy-motion-easing,ease);flex-shrink:0}details[open]>summary .roxy-chevron{transform:rotate(180deg)}@media (prefers-reduced-motion:reduce){.roxy-chevron{transition:none}}`;var ur=b`.interp-keywords{flex-wrap:wrap;gap:.25rem;display:flex}.interp-keywords .kw{border-radius:var(--roxy-radius-full,9999px);background:color-mix(in srgb, var(--roxy-accent,#f59e0b) 14%, transparent);color:var(--roxy-fg,#0a0a0a);font-size:var(--roxy-text-xs,.75rem);padding:1px 8px}`,vt=b`.block{border-top:1px solid var(--roxy-border,#e4e4e7);padding-top:var(--roxy-space-md,1rem)}.block h3{margin:0 0 var(--roxy-space-sm,.5rem);font-size:var(--roxy-text-sm,.875rem);font-weight:var(--roxy-weight-bold,600);color:var(--roxy-muted,#71717a);text-transform:uppercase;letter-spacing:.06em}.interp-card{border:1px solid var(--roxy-border,#e4e4e7);border-radius:var(--roxy-radius-md,8px);padding:var(--roxy-space-sm,.5rem) var(--roxy-space-md,1rem);margin-bottom:var(--roxy-space-xs,.25rem)}.interp-card summary{cursor:pointer;color:var(--roxy-fg,#0a0a0a);align-items:center;gap:var(--roxy-space-sm,.5rem);font-weight:500;font-size:var(--roxy-text-sm,.875rem);display:flex}.interp-card summary:focus-visible{outline:2px solid var(--roxy-ring,#f59e0b66);outline-offset:2px;border-radius:var(--roxy-radius-sm,4px)}.interp-lead{flex-wrap:wrap;flex:auto;order:1;align-items:baseline;gap:.4rem;min-width:0;display:inline-flex}.interp-aside{flex-shrink:0;order:2;align-items:center;gap:.5rem;display:inline-flex}.roxy-chevron{order:3}.interp-aside small{color:var(--roxy-muted,#71717a);white-space:nowrap;font-weight:400}@container (width<=26rem){.interp-card summary{flex-wrap:wrap}.roxy-chevron{order:2}.interp-aside{flex-basis:100%;order:3;justify-content:flex-end}}.interp-body{margin-top:var(--roxy-space-sm,.5rem);gap:var(--roxy-space-sm,.5rem);color:var(--roxy-fg,#0a0a0a);font-size:var(--roxy-text-sm,.875rem);overflow-wrap:anywhere;line-height:1.6;display:grid}.interp-body p{margin:0}${ur}`;function wt(n,e,t){let r=n.filter(o=>!!o.body);return r.length===0?d:u`<section class="block" part="section readings"><h3>${t}</h3>${r.map((o,s)=>u`<details class="interp-card" part="reading" name="${e}" ?open="${s===0}"><summary><span class="interp-lead">${o.label}</span> ${xt()} ${o.aside?u`<span class="interp-aside"><small>${o.aside}</small></span>`:d}</summary><div class="interp-body"><p>${o.body}</p>${o.extra??d}</div></details>`)}</section>`}var mr="roxy-data";function fr(n){return n.nodeName==="SCRIPT"&&n.getAttribute("type")==="application/json"}var he=class{constructor(e){this.host=e,e.addController(this)}hostConnected(){if(this.host.data!=null)return;let e=this.read();e!==void 0&&(this.host.data=e,this.host.requestUpdate())}read(){let e=this.findInlineScript();return e?this.parse(e.textContent):void 0}findInlineScript(){for(let e of Array.from(this.host.children))if(fr(e)&&e.classList.contains(mr))return e;return null}parse(e){if(e?.trim())try{return JSON.parse(e)}catch{return}}};var gr={fromAttribute:n=>{if(n!=null){try{let e=JSON.parse(n);if(e&&typeof e=="object"&&!Array.isArray(e))return e}catch{}console.warn("[roxy-ui] submit-context must be a JSON object; sending the request without it.")}}},m=class extends ae{constructor(){super();this.data=null;this.endpoint="";this.method="POST";this.remember=!1;this.hideReadings=!1;this.hideSections="";this.loading=!1;this.error=null;this.issues=null;this.selfFetched=!1;this.editing=!1;this.sticky=!1;this.moreLoading=!1;this.moreError=null;this.onMore=async()=>{let t=this.lastRequest,r=this.listKey,o=this.listRows();if(!(!t||!r||!o)){this.moreLoading=!0,this.moreError=null;try{let s=await Te(this.fetcher,{...t,query:{...t.query,offset:o.length}});if(this.lastRequest!==t)return;let i=s[r];this.data={...this.data,...s,[r]:[...o,...Array.isArray(i)?i:[]]}}catch(s){this.lastRequest===t&&(this.moreError=s instanceof Error?s.message:String(s))}finally{this.moreLoading=!1}}};this.onEdit=()=>{this.editing=!0};this.onFormSubmit=t=>{let r=t.detail;this.lastValues=r.values,this.sticky=!!r.sticky,this.selfFetched=!0,this.editing=!1,this.remember&&this.writeRemembered(r.values),this.fetchFresh(yt(this.endpoint,this.method,r.values,r.queryKeys??[]))};new he(this),this.fetcher=new de(this)}static{this.styles=[le]}willUpdate(t){if(t.has("data")&&this.data!=null){let r=ht(this.data);r!==this.data&&(this.data=r)}(t.has("publishableKey")||t.has("baseUrl")||t.has("submitUrl")||t.has("submitContext"))&&this.syncFetcher()}syncFetcher(){this.fetcher.publishableKey=this.publishableKey,this.baseUrl&&(this.fetcher.baseUrl=this.baseUrl),this.fetcher.submitUrl=this.submitUrl,this.fetcher.submitContext=this.submitContext}render(){return u`${this.hiddenSectionsStyle()}${this.renderState()}`}drawn(t){try{return this.renderData(t)}catch(r){return console.warn(`[roxy-ui] ${this.localName} could not draw its response`,r),this.dispatchEvent(new CustomEvent("roxy-render-error",{detail:{error:r},bubbles:!0,composed:!0})),customElements.get("roxy-data")?u`<roxy-data .data="${t}" lang="${L(this.effectiveLang())}"></roxy-data>`:this.renderEmpty()}}hiddenSectionsStyle(){let t=this.hideSections.split(",").map(o=>o.trim().toLowerCase()).filter(o=>/^[a-z][a-z0-9-]*$/.test(o));if(t.length===0)return d;let r=t.map(o=>`[part~="${o}"],roxy-endpoint-form::part(${o}){display:none!important}`).join("");return u`<style>${r}</style>`}renderState(){return this.endpoint&&this.sticky&&this.selfFetched&&!this.editing?this.renderWithForm(this.stickyBody()):this.loading?this.renderLoading():this.error!=null?this.renderError(this.error):this.data!=null?this.selfFetched?this.editing?this.renderForm():this.renderResult(this.data):this.showAttribution()?u`${this.drawn(this.data)}${this.renderAttribution()}`:this.drawn(this.data):this.renderNoData()}renderInterpretation(t,r,o){return this.hideReadings?d:wt(t,r,this.t(o??"Reading"))}renderResult(t){let r=u`<div class="roxy-edit-bar" part="edit-bar"><button type="button" class="roxy-edit" @click="${this.onEdit}">${this.t("Edit query")}</button></div>${this.drawn(t)}`;return this.showAttribution()?u`${r}${this.renderAttribution()}`:r}renderWithForm(t){return u`${this.renderForm()}${t}`}stickyBody(){return this.loading?this.renderLoading():this.error!=null?this.issues?d:this.renderErrorBanner(this.error):this.data==null?d:this.showAttribution()?u`${this.drawn(this.data)}${this.renderAttribution()}`:this.drawn(this.data)}renderMore(){let t=this.listRows(),r=this.data?.total;return!this.lastRequest||!t||typeof r!="number"?d:t.length>=r?d:u`<div class="roxy-more" part="more"><button type="button" class="roxy-edit" ?disabled="${this.moreLoading}" aria-busy="${this.moreLoading?"true":"false"}" @click="${this.onMore}">${this.t("Show more")}</button> ${this.moreError?u`<p class="roxy-error" role="alert">${this.t(this.moreError)}</p>`:d}</div>`}listRows(){let t=this.listKey?this.data?.[this.listKey]:void 0;return Array.isArray(t)?t:void 0}fetchFresh(t){return this.lastRequest=t,this.openedRow=void 0,this.openedRowId=void 0,this.moreError=null,this.fetcher.run(t)}load(t){return this.syncFetcher(),this.fetchFresh(t)}pickRow(t){this.dispatchEvent(new CustomEvent("roxy-symbol-select",{detail:t,bubbles:!0,composed:!0})),this.openRow(t.id)}openRow(t){if(!this.rowDetail||!(this.publishableKey||this.submitUrl))return;let r=this.openedRow??document.createElement(this.rowDetail.tag);r.publishableKey=this.publishableKey,r.baseUrl=this.baseUrl,r.submitUrl=this.submitUrl,r.submitContext=this.submitContext,r.hideReadings=this.hideReadings,r.hideSections=this.hideSections;let o=this.effectiveLang();o&&r.setAttribute("lang",o),this.openedRow=r,this.openedRowId=t,r.load({path:`/${this.rowDetail.path.replace("{id}",encodeURIComponent(t))}`,method:"GET",query:{lang:ot(this)}}).then(()=>r.scrollIntoView?.({block:"nearest"}))}showAttribution(){return this.attribution!=null&&this.attribution!=="off"&&this.attribution!=="false"}renderAttribution(){return u`<div class="roxy-attribution" part="attribution"><a href="https://roxyapi.com/?utm_source=widget&utm_medium=embed" target="_blank" rel="noopener">${this.t("Spiritual data by RoxyAPI")}</a></div>`}renderNoData(){return this.endpoint?this.renderWithForm(d):this.renderEmpty()}renderForm(){return u`<roxy-endpoint-form part="form" exportparts="hint" data-endpoint="${this.endpoint}" method="${this.method}" spec-url="${L(this.specUrl)}" publishable-key="${L(this.publishableKey)}" location-url="${L(this.locationUrl)}" submit-label="${L(this.submitLabel)}" lang="${L(this.effectiveLang())}" .initialValues="${this.formInitialValues()}" .serverIssues="${this.issues}" .apiRoute="${this.fetcher}" .autoload="${!this.selfFetched}" @roxy-submit="${this.onFormSubmit}"></roxy-endpoint-form>`}formInitialValues(){return this.lastValues??(this.remember?this.readRemembered():void 0)}rememberKey(){return`roxy-ui:form:${this.endpoint}`}readRemembered(){try{let t=sessionStorage.getItem(this.rememberKey());return t?JSON.parse(t):void 0}catch{return}}writeRemembered(t){try{sessionStorage.setItem(this.rememberKey(),JSON.stringify(t))}catch{}}renderEmpty(){return u`<div class="roxy-empty" role="status" part="empty">${this.t("No data")}</div>`}renderLoading(){return u`<div class="roxy-skeleton" style="height:8rem" role="status" aria-label="${this.t("Loading")}" part="loading"></div>`}renderError(t){if(this.endpoint&&this.issues)return this.renderForm();let r=this.renderErrorBanner(t);return this.endpoint?u`${r}${this.renderForm()}`:r}renderErrorBanner(t){return u`<div class="roxy-error" role="alert" part="error">${this.errorMessage||this.t(t)}</div>`}};f([x({attribute:!1})],m.prototype,"data",2),f([x({type:String,attribute:"data-endpoint"})],m.prototype,"endpoint",2),f([x({type:String})],m.prototype,"method",2),f([x({type:String,attribute:"publishable-key"})],m.prototype,"publishableKey",2),f([x({type:String,attribute:"base-url"})],m.prototype,"baseUrl",2),f([x({type:String,attribute:"spec-url"})],m.prototype,"specUrl",2),f([x({type:String,attribute:"submit-url"})],m.prototype,"submitUrl",2),f([x({attribute:"submit-context",converter:gr})],m.prototype,"submitContext",2),f([x({type:String,attribute:"location-url"})],m.prototype,"locationUrl",2),f([x({type:Boolean})],m.prototype,"remember",2),f([x({type:Boolean,attribute:"hide-readings",reflect:!0})],m.prototype,"hideReadings",2),f([x({type:String,attribute:"hide-sections",reflect:!0})],m.prototype,"hideSections",2),f([x({type:String,attribute:"submit-label"})],m.prototype,"submitLabel",2),f([x({type:String,attribute:"error-message"})],m.prototype,"errorMessage",2),f([x({type:String})],m.prototype,"attribution",2),f([$()],m.prototype,"loading",2),f([$()],m.prototype,"error",2),f([$()],m.prototype,"issues",2),f([$()],m.prototype,"selfFetched",2),f([$()],m.prototype,"editing",2),f([$()],m.prototype,"sticky",2),f([$()],m.prototype,"openedRow",2),f([$()],m.prototype,"openedRowId",2),f([$()],m.prototype,"moreLoading",2),f([$()],m.prototype,"moreError",2);var Rt=14,yr=86,Et=0,xr=102,S=6,Tt=(yr-Rt)*S,br=(xr-Et)*S;function U(n,e){return{x:(n-Rt)*S,y:(e-Et)*S}}var c=50,me=n=>2*c-n,Y=1.02*S,Ot=1.35*S,Me=1.15*S,y=2.87,w=4.4,$t=5.65,Oe={head:{64:[c-y,11.2],61:[c,11.2],63:[c+y,11.2]},ajna:{47:[c-y,18],24:[c,18],4:[c+y,18],17:[c-y,20.6],11:[c+y,20.6],43:[c,25.3]},throat:{62:[c-y,32.4],23:[c,32.4],56:[c+y,32.4],16:[c-w,34.7],35:[c+w,34.7],20:[c-w,37.3],12:[c+w,37.3],45:[c+w,39.6],31:[c-y,41.9],8:[c,41.9],33:[c+y,41.9]},g:{1:[c,47.7],7:[c-y,50.3],13:[c+y,50.3],10:[c-$t,53.4],25:[c+$t,53.4],15:[c-y,56.8],46:[c+y,56.8],2:[c,59.2]},heart:{21:[63.9,59.5],51:[62.1,61.3],26:[60.1,63.3],40:[66.6,63.3]},spleen:{48:[20,70.8],57:[22.5,72.4],44:[25,73.8],50:[27.7,75.3],32:[25,76.6],28:[22.5,78],18:[20,79.5]},sacral:{5:[c-y,72.7],14:[c,72.7],29:[c+y,72.7],34:[c-w,75.4],27:[c-w,79],59:[c+w,79],42:[c-y,81.7],3:[c,81.7],9:[c+y,81.7]},"solar-plexus":{},root:{53:[c-y,90.2],60:[c,90.2],52:[c+y,90.2],54:[c-w,92.6],19:[c+w,92.6],38:[c-w,95.3],39:[c+w,95.3],58:[c-w,98.1],41:[c+w,98.1]}},vr={48:36,57:22,44:37,50:6,32:49,28:55,18:30};function wr(){let n={},e={};for(let[t,[r,o]]of Object.entries(Oe.spleen))Oe["solar-plexus"][vr[Number(t)]]=[me(r),o];for(let[t,r]of Object.entries(Oe))for(let[o,[s,i]]of Object.entries(r))n[Number(o)]=U(s,i),e[Number(o)]=t;return{points:n,centerOf:e}}var{points:Ue,centerOf:wo}=wr(),$o=Tt/2;function I(n){return n.map(([e,t])=>U(e,t))}function Pe(n,e,t){return I([[c-n,e],[c+n,e],[c+n,t],[c-n,t]])}var Le=5.9,kt=[[18.3,68.3],[18.3,82],[30.3,75.15]],Ie=[20,84.4],At=12*S,$r=[63.2,67.9],kr=13.1*S,Ar=[{id:"head",label:"Head",color:"gold",points:I([[43.55,12.5],[56.45,12.5],[50,1.7]])},{id:"ajna",label:"Ajna",color:"green",points:I([[43.55,16.5],[56.45,16.5],[50,27.7]])},{id:"throat",label:"Throat",color:"brown",points:Pe(Le,31,43.3)},{id:"g",label:"G",color:"gold",points:I([[50,45.8],[57.7,53.6],[50,61.4],[42.3,53.6]])},{id:"heart",label:"Heart",color:"red",points:I([[56.65,65.23],[64.2,56.74],[69.75,65.23]]),caption:{at:U(...$r),room:kr}},{id:"spleen",label:"Spleen",color:"brown",points:I(kt),caption:{at:U(...Ie),room:At}},{id:"sacral",label:"Sacral",color:"red",points:Pe(Le,71.3,83.1)},{id:"solar-plexus",label:"Solar Plexus",color:"brown",points:I(kt.map(([n,e])=>[me(n),e])),caption:{at:U(me(Ie[0]),Ie[1]),room:At}},{id:"root",label:"Root",color:"brown",points:Pe(Le,88.5,99.8)}],Sr=[[64,47],[61,24],[63,4],[17,62],[11,56],[43,23],[16,48],[20,34],[20,10],[7,31],[1,8],[13,33],[21,45],[12,22],[35,36],[57,20],[15,5],[2,14],[46,29],[34,10],[10,57],[25,51],[27,50],[57,34],[26,44],[18,58],[28,38],[32,54],[3,60],[9,52],[42,53],[59,6],[19,49],[39,55],[41,30],[37,40]],_r=Cr();function Cr(){let n=me,e=[[50,3],[58,3],[60,10],[57,17.5],[56.5,20.5],[53.5,23.5],[51.5,27],[54,28],[64,30],[79,35],[83,42],[84,58],[83,74],[83,86],[76,93],[68,97],[64,99],[62,100.5],[60,100.5]],t=[`M ${pe(e[0])}`];for(let r=1;r+2<e.length;r+=3)t.push(`C ${pe(e[r])} ${pe(e[r+1])} ${pe(e[r+2])}`);t.push(`L ${ue(e[e.length-1],n)}`);for(let r=e.length-3;r>=1;r-=3)t.push(`C ${ue(e[r+1],n)} ${ue(e[r],n)} ${ue(e[r-1],n)}`);return t.push("Z"),t.join(" ")}function pe([n,e]){let t=U(n,e);return`${t.x} ${t.y}`}function ue([n,e],t){let r=U(t(n),e);return`${r.x} ${r.y}`}function Rr(n){return n.map(e=>`${e.x},${e.y}`).join(" ")}function Pt(n){return n.left&&n.right?"both":n.left?"src-left":"src-right"}function Er(){return v`<path class="bg-body" d=${_r} />`}function Tr(n){let e=[];for(let[t,r]of Sr){let o=Ue[t],s=Ue[r];if(!o||!s)continue;e.push(v`<line class="bg-channel" x1=${o.x} y1=${o.y} x2=${s.x} y2=${s.y} />`);let i={x:(o.x+s.x)/2,y:(o.y+s.y)/2};for(let[l,a]of[[t,o],[r,s]]){let h=n.get(l);if(!h)continue;let p=Pt(h);e.push(v`<line class="bg-half ${p==="both"?"src-left":p}" x1=${a.x} y1=${a.y} x2=${i.x} y2=${i.y} />`),p==="both"&&e.push(v`<line class="bg-half src-right stripe" x1=${a.x} y1=${a.y} x2=${i.x} y2=${i.y} />`)}}return e}function Or(n,e,t){return Ar.flatMap(r=>{let o=n.has(r.id),s=`bg-center bg-${r.color}${o?" defined":""}`,i=e?.get(r.id)||r.label;return[v`<polygon class=${s} points=${Rr(r.points)}><title>${i}: ${o?t.defined:t.open}</title></polygon>`,r.caption?St(i,r.caption.at,"bg-caption",r.caption.room):St(i,_t(r.points),o?"defined":"",Lr(r.points,_t(r.points).y)*.86)]})}function St(n,e,t,r){let o=n.split(/\s+/).filter(Boolean),s=o.reduce((h,p)=>Math.max(h,p.length),0),i=Math.min(Me,r/Math.max(1,s*Pr)),l=i*1.05,a=e.y-l*(o.length-1)/2;return v`<text class="bg-center-name ${t}" style=${`font-size:${i}px`} x=${e.x} y=${e.y} text-anchor="middle" dominant-baseline="central" aria-hidden="true">${o.map((h,p)=>v`<tspan x=${e.x} y=${a+p*l}>${h}</tspan>`)}</text>`}var Pr=.66;function Lr(n,e){let t=[];for(let r=0;r<n.length;r++){let o=n[r],s=n[(r+1)%n.length];if(o.y===s.y)continue;let i=Math.min(o.y,s.y),l=Math.max(o.y,s.y);e<i||e>l||t.push(o.x+(e-o.y)/(s.y-o.y)*(s.x-o.x))}return t.length<2?0:Math.max(...t)-Math.min(...t)}function _t(n){let e=n.length||1;return{x:n.reduce((t,r)=>t+r.x,0)/e,y:n.reduce((t,r)=>t+r.y,0)/e}}function Ct(n,e){return`M ${n.x} ${n.y-Y} A ${Y} ${Y} 0 0 ${e} ${n.x} ${n.y+Y} Z`}function Ir(n,e){let t=[];for(let[r,o]of Object.entries(Ue)){let s=Number(r),i=n.get(s),l=i?Pt(i):"",a=e.get(s);t.push(v`<g class="bg-gate-node">
			${l==="both"?[v`<path class="bg-gate-dot on src-left" d=${Ct(o,0)} />`,v`<path class="bg-gate-dot on src-right" d=${Ct(o,1)} />`]:v`<circle class="bg-gate-dot ${l&&`on ${l}`}" cx=${o.x} cy=${o.y} r=${Y} />`}
			<text class="bg-gate ${i?"on":""}" x=${o.x} y=${o.y} text-anchor="middle" dominant-baseline="central">${s}</text>
			${a?v`<title>${a}</title>`:d}
		</g>`)}return t}var Lt=`0 0 ${Tt} ${br}`;function It(n){return v`
		${Er()}
		${Tr(n.gateSources)}
		${Or(n.definedCenters,n.centerNames,n.stateWords??{defined:"defined",open:"open"})}
		${Ir(n.gateSources,n.gateTitles)}
	`}var Ut=b`.chart{width:100%;max-width:var(--roxy-chart-max-width,30rem);height:auto;margin:0 auto;display:block}@container (width<=26rem){.chart{width:calc(100% + 2 * var(--roxy-space-lg,1.5rem));margin-inline:calc(-1 * var(--roxy-space-lg,1.5rem))}}.bg-body{fill:color-mix(in srgb, var(--roxy-secondary,#475569) 8%, transparent);stroke:var(--roxy-border,#e4e4e7);stroke-width:1px}.bg-channel{stroke:var(--roxy-border,#e4e4e7);stroke-width:5px;stroke-linecap:round}.bg-half{stroke-width:5px;stroke-linecap:round}.bg-half.stripe{stroke-linecap:butt;stroke-dasharray:7 7}.bg-center{fill:var(--roxy-surface,#fff);stroke:var(--roxy-secondary,#475569);stroke-width:1.8px}.bg-center.defined{stroke:color-mix(in srgb, var(--roxy-fg,#0a0a0a) 45%, transparent)}:host{--center-gold:#e0a200;--center-green:#2f8f00;--center-red:#c41f1f;--center-brown:#76502f}.bg-center.bg-gold.defined,.legend .swatch.bg-gold{fill:var(--center-gold);background:var(--center-gold)}.bg-center.bg-green.defined,.legend .swatch.bg-green{fill:var(--center-green);background:var(--center-green)}.bg-center.bg-red.defined,.legend .swatch.bg-red{fill:var(--center-red);background:var(--center-red)}.bg-center.bg-brown.defined,.legend .swatch.bg-brown{fill:var(--center-brown);background:var(--center-brown)}.bg-gate-dot{fill:var(--roxy-surface,#fff);stroke:var(--roxy-border,#e4e4e7);stroke-width:1px}.bg-gate-dot.on{stroke:none}.bg-center-name{fill:var(--roxy-muted,#71717a);opacity:.5;font-size:${Me}px;letter-spacing:.08em;text-transform:uppercase;pointer-events:none;font-weight:600}.bg-center-name.defined{fill:var(--roxy-surface,#fff);opacity:.62}.bg-gate{fill:var(--roxy-muted,#71717a);font-size:${Ot}px;font-weight:600;font-family:var(--roxy-font-sans)}.bg-gate.on{fill:var(--src-ink,var(--roxy-surface,#fff))}.legend{gap:var(--roxy-space-sm,.5rem) var(--roxy-space-md,1rem);font-size:var(--roxy-text-xs,.75rem);color:var(--roxy-muted,#71717a);flex-wrap:wrap;display:flex}.legend .swatch{vertical-align:middle;border:1px solid var(--roxy-secondary,#475569);border-radius:2px;width:10px;height:10px;margin-right:4px;display:inline-block}.bg-half.src-left{stroke:var(--src-left)}.bg-half.src-right{stroke:var(--src-right)}.bg-gate-dot.on.src-left{fill:var(--src-left)}.bg-gate-dot.on.src-right{fill:var(--src-right)}.legend .swatch.src-left{background:var(--src-left)}.legend .swatch.src-right{background:var(--src-right)}.legend .swatch.source{border-radius:var(--roxy-radius-full,9999px);border-color:#0000}`;var Mt=b`.facts{gap:var(--roxy-space-sm,.5rem);grid-template-columns:repeat(auto-fit,minmax(8rem,1fr));display:grid}.fact{border:1px solid var(--roxy-border,#e4e4e7);border-radius:var(--roxy-radius-md,8px);padding:var(--roxy-space-sm,.5rem) var(--roxy-space-md,1rem);background:var(--roxy-surface,#fff)}.fact span{color:var(--roxy-muted,#71717a);font-size:var(--roxy-text-xs,.75rem);text-transform:uppercase;letter-spacing:.06em;display:block}.fact strong{font-size:var(--roxy-text-base,1rem);color:var(--roxy-fg,#0a0a0a);hyphens:auto;overflow-wrap:anywhere}.lead{color:var(--roxy-fg,#0a0a0a);font-size:var(--roxy-text-sm,.875rem);margin:0;line-height:1.6}.themes{gap:var(--roxy-space-sm,.5rem);flex-wrap:wrap;display:flex}.pill{border-radius:var(--roxy-radius-full,9999px);font-size:var(--roxy-text-xs,.75rem);padding:2px 10px}.pill--good{background:color-mix(in srgb, var(--roxy-success,#16a34a) 16%, transparent);color:var(--roxy-success-fg,#166534)}.pill--shadow{background:color-mix(in srgb, var(--roxy-danger,#dc2626) 16%, transparent);color:var(--roxy-danger-fg,#991b1b)}.keynotes{gap:var(--roxy-space-xs,.25rem);margin:0;display:grid}.keynotes dt{font-size:var(--roxy-text-xs,.75rem);color:var(--roxy-muted,#71717a);text-transform:uppercase;letter-spacing:.05em}.keynotes dd{margin:0}`;function Nt(n){let e=n.filter(t=>!!t.value);return e.length===0?d:u`<div class="facts" part="facts">${e.map(t=>u`<div class="fact" part="fact"><span>${t.label}</span> <strong>${t.value}</strong></div>`)}</div>`}var B=class extends m{renderChart(e){let t=new Map;for(let i of e.channels??[]){let l=new Set(i.personAGates??[]),a=new Set(i.personBGates??[]);for(let h of[i.gateA,i.gateB]){if(h==null)continue;let p=t.get(h)??{left:!1,right:!1};p.left||=l.has(h),p.right||=a.has(h),t.set(h,p)}}let r=new Set((e.centers??[]).filter(i=>i.defined).map(i=>i.id)),o=new Map((e.centers??[]).map(i=>[i.id,i.name])),s=new Map;for(let i of e.channels??[]){let l=i.name;for(let a of[i.gateA,i.gateB]){if(a==null)continue;let h=t.get(a),p=[h?.left&&"A",h?.right&&"B"].filter(Boolean).join(" + ");s.set(a,[`Gate ${a}`,l,p].filter(Boolean).join(" · "))}}return u`<svg class="chart" part="chart" viewBox="${Lt}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Combined Human Design bodygraph for two charts, with each gate marked for the person who carries it"><title>Combined bodygraph</title>${It({definedCenters:r,gateSources:t,gateTitles:s,centerNames:o,stateWords:{defined:"Defined",open:"Open"}})}</svg><div class="legend" part="legend"><span><span class="swatch source src-left"></span>Person A</span> <span><span class="swatch source src-right"></span>Person B</span> <span><span class="swatch"></span>Open center</span></div>`}renderData(e){let t=e.channels??[],r=e.centers??[],o=r.filter(s=>s.defined).length;return u`<div class="wrap" part="card" aria-label="Human Design connection"><header class="head" part="header"><h2 class="title">Connection</h2>${typeof e.totalChannels=="number"?u`<span class="count">${e.totalChannels} channels</span>`:d}</header>${this.renderChart(e)} ${Nt([{label:"Channels",value:e.totalChannels?.toString()},{label:"Combined definition",value:e.combinedDefinition?se(String(e.combinedDefinition)):void 0},{label:"Centers defined",value:r.length>0?`${o} of ${r.length}`:void 0}])} ${this.hideReadings?d:u`<p class="lead">A connection chart reads the two charts as one bodygraph. Wherever the two of them together hold both gates of a channel, that channel is defined between them, and the centers it joins are defined in the connection whether or not either person defines them alone.</p>`} ${this.renderDynamics(e.summary)} ${this.renderCenters(r)} ${this.renderChannels(t,r)}</div>`}renderDynamics(e){if(!e)return d;let t=[{label:"Electromagnetic",aside:fe(e.electromagnetic),body:"Each person holds one of the two gates, so the channel completes only when they are together. The classic point of attraction."},{label:"Dominance",aside:fe(e.dominance),body:"One person holds both gates and the other holds neither, so the conditioning runs one way, from the person who carries the channel to the person who does not."},{label:"Compromise",aside:fe(e.compromise),body:"One person holds both gates and the other holds a single hanging gate of the same channel, so the channel is complete for one of them and half open for the other."},{label:"Companionship",aside:fe(e.companionship),body:"Both people independently hold both gates, so neither needs the other to complete it. A shared and familiar frequency rather than an attraction."}];return this.renderInterpretation(t,"hd-connection-dynamic","Dynamics")}renderCenters(e){return e.length===0?d:u`<section class="block" part="section centers"><h3>Centers</h3>${this.hideReadings?d:u`<p class="note">Defined is the state of the combined chart. Beside it is who already defines that center in their own chart. A center defined only together is what the connection itself creates: it is there when the two are together and gone when they are apart. The combined definition counts how the defined centers hang together, so Single is one connected piece and a split is more than one.</p>`} ${e.map(t=>{let r=t.definedBy??[],o=r.includes("A"),s=r.includes("B"),i=!!t.defined&&!o&&!s;return u`<div class="row"><span class="cname">${t.name??se(String(t.id??""))}</span> <span class="badge ${t.defined?i?"together":"defined":"open"}">${t.defined?i?"Only together":"Defined":"Open"} </span><span class="who">${Ur(!!t.defined,o,s)}</span></div>`})}</section>`}renderChannels(e,t){if(e.length===0)return d;let r=new Map(t.map(s=>[String(s.id??""),s.name??""])),o=s=>r.get(s)||se(s);return u`<section class="block" part="section channels"><h3>Channels</h3><div class="scroll" part="table" tabindex="0" role="region" aria-label="Connection channels"><table role="table"><caption class="roxy-sr-only">Connection channels: each channel with its gates, the centers it links, its circuit and dynamic, and the gates person A and person B each hold.</caption><thead><tr><th scope="col">Channel</th><th scope="col">Gates</th><th scope="col">Centers</th><th scope="col">Circuit</th><th scope="col">Dynamic</th><th scope="col">Person A holds</th><th scope="col">Person B holds</th></tr></thead><tbody>${e.map(s=>u`<tr><td>${s.name??""}</td><td class="gates">${s.gateA}-${s.gateB}</td><td>${(s.centers??[]).map(o).join(" to ")}</td><td>${s.circuit??""}</td><td>${s.dynamic?u`<span class="dyn">${s.dynamic}</span>`:d}</td><td class="held">${Bt(s.personAGates)}</td><td class="held">${Bt(s.personBGates)}</td></tr>`)}</tbody></table></div></section>`}};B.styles=[le,bt,vt,Mt,Ut,b`.wrap{background:var(--roxy-surface,#fff);color:var(--roxy-fg,#0a0a0a);border:1px solid var(--roxy-border,#e4e4e7);border-radius:var(--roxy-radius-md,8px);padding:var(--roxy-space-lg,1.5rem);box-shadow:var(--roxy-shadow-sm);gap:var(--roxy-space-md,1rem);grid-template-columns:minmax(0,1fr);display:grid}.head{justify-content:space-between;align-items:baseline;gap:var(--roxy-space-sm,.5rem);flex-wrap:wrap;display:flex}.title{font-size:var(--roxy-text-lg,1.125rem);font-weight:var(--roxy-weight-bold,600);margin:0}.count{color:var(--roxy-accent-ink,#b45309);font-size:var(--roxy-text-sm,.875rem);font-weight:var(--roxy-weight-bold,600);font-variant-numeric:tabular-nums}.note{margin:0 0 var(--roxy-space-sm,.5rem);font-size:var(--roxy-text-xs,.75rem);color:var(--roxy-muted,#71717a);line-height:1.6}.row{align-items:center;gap:var(--roxy-space-sm,.5rem);padding:var(--roxy-space-sm,.5rem) 0;border-bottom:1px solid var(--roxy-border,#e4e4e7);font-size:var(--roxy-text-sm,.875rem);flex-wrap:wrap;display:flex}.row:last-child{border-bottom:none}.cname{flex:1;min-width:8rem}.badge{border-radius:var(--roxy-radius-full,9999px);font-size:var(--roxy-text-xs,.75rem);font-weight:var(--roxy-weight-bold,600);padding:1px 8px;display:inline-flex}.badge.defined{background:color-mix(in srgb, var(--roxy-success,#16a34a) 16%, transparent);color:var(--roxy-success-fg,#166534)}.badge.open{background:color-mix(in srgb, var(--roxy-border,#e4e4e7) 45%, transparent);color:var(--roxy-fg,#0a0a0a)}.badge.together{background:color-mix(in srgb, var(--roxy-accent,#f59e0b) 18%, transparent);color:var(--roxy-fg,#0a0a0a)}.who{color:var(--roxy-muted,#71717a);font-size:var(--roxy-text-xs,.75rem)}table{border-collapse:collapse;width:100%;font-size:var(--roxy-text-sm,.875rem)}th,td{text-align:left;padding:var(--roxy-space-sm,.5rem);border-bottom:1px solid var(--roxy-border,#e4e4e7);white-space:nowrap}th{color:var(--roxy-muted,#71717a);font-weight:var(--roxy-weight-bold,600);text-transform:uppercase;font-size:var(--roxy-text-xs,.75rem);letter-spacing:.04em}tbody tr:last-child td{border-bottom:none}.gates{font-variant-numeric:tabular-nums;color:var(--roxy-accent-ink,#b45309);font-weight:var(--roxy-weight-bold,600)}.dyn{border-radius:var(--roxy-radius-full,9999px);font-size:var(--roxy-text-xs,.75rem);background:color-mix(in srgb, var(--roxy-accent,#f59e0b) 16%, transparent);color:var(--roxy-fg,#0a0a0a);padding:1px 8px;display:inline-block}.held{font-variant-numeric:tabular-nums}.scroll{min-width:0;overflow-x:auto}.wrap{--src-left:#1f6fb2;--src-right:#b04e14;--src-ink:#fff}`],B=f([rt("roxy-hd-connection")],B);function fe(n){if(typeof n=="number")return n===0?"None":n===1?"1 channel":`${n} channels`}function Bt(n){let e=n??[];return e.length>0?e.join(", "):"Neither"}function Ur(n,e,t){return e&&t?"Defined in both charts":e?"Defined by A":t?"Defined by B":n?"Defined by neither alone, only by the connection":"Open in both charts"}Z();return Ft(Mr);})();
/*! Bundled license information:

@lit/reactive-element/css-tag.js:
  (**
   * @license
   * Copyright 2019 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/reactive-element.js:
lit-html/lit-html.js:
lit-element/lit-element.js:
@lit/reactive-element/decorators/custom-element.js:
@lit/reactive-element/decorators/property.js:
@lit/reactive-element/decorators/state.js:
@lit/reactive-element/decorators/event-options.js:
@lit/reactive-element/decorators/base.js:
@lit/reactive-element/decorators/query.js:
@lit/reactive-element/decorators/query-all.js:
@lit/reactive-element/decorators/query-async.js:
@lit/reactive-element/decorators/query-assigned-nodes.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/is-server.js:
  (**
   * @license
   * Copyright 2022 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/decorators/query-assigned-elements.js:
  (**
   * @license
   * Copyright 2021 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/directives/if-defined.js:
  (**
   * @license
   * Copyright 2018 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)
*/
//# sourceMappingURL=hd-connection.js.map
