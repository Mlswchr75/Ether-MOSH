const SHAPES = {
  breach:"polygon(2% 28%,8% 20%,17% 22%,23% 9%,34% 14%,42% 3%,53% 11%,65% 5%,73% 17%,86% 12%,98% 25%,94% 39%,100% 52%,92% 61%,96% 76%,82% 72%,75% 91%,62% 84%,54% 98%,43% 88%,32% 95%,25% 80%,10% 84%,13% 66%,1% 59%,7% 44%)",
  rift:"polygon(42% 0,56% 5%,62% 14%,55% 25%,68% 34%,57% 45%,64% 58%,52% 67%,58% 79%,46% 100%,35% 91%,40% 76%,28% 65%,38% 52%,30% 41%,42% 29%,35% 16%)",
  crater:"polygon(19% 8%,37% 3%,53% 10%,68% 5%,82% 19%,95% 35%,91% 53%,98% 68%,82% 85%,65% 92%,49% 100%,32% 92%,17% 96%,8% 78%,1% 61%,8% 44%,3% 27%)",
  slash:"polygon(1% 62%,9% 50%,20% 47%,29% 35%,42% 39%,51% 25%,64% 31%,76% 18%,86% 22%,100% 8%,94% 34%,83% 40%,76% 53%,62% 51%,54% 66%,42% 62%,31% 78%,18% 72%,8% 91%)",
  fissure:"polygon(0 42%,8% 33%,16% 39%,25% 25%,34% 34%,43% 20%,53% 35%,61% 27%,70% 39%,80% 26%,90% 35%,100% 29%,96% 58%,86% 65%,77% 58%,66% 72%,57% 59%,47% 75%,38% 61%,28% 70%,18% 58%,8% 67%,2% 57%)",
  edge:"polygon(36% 0,100% 0,100% 100%,19% 100%,26% 89%,13% 79%,28% 67%,20% 54%,32% 43%,22% 31%,38% 18%)",
};

class MoshJourneyPortal extends HTMLElement {
  static observedAttributes = ["shape","seed","palette","intensity","cadence","label","clip","src"];
  constructor(){
    super();
    this.attachShadow({mode:"open"});
    this._frame = null;
  }
  connectedCallback(){ this.render(); }
  attributeChangedCallback(){ if(this.isConnected) this.render(); }
  render(){
    const shape = SHAPES[this.getAttribute("shape")] ? this.getAttribute("shape") : "breach";
    const base = this.getAttribute("src") || "https://ether-mosh.online/embed/journey";
    const url = new URL(base, location.href);
    ["seed","palette","intensity","cadence","label"].forEach(name => {
      const value = this.getAttribute(name);
      if(value !== null) url.searchParams.set(name,value);
    });
    url.searchParams.set("shape",shape);
    const clip = this.getAttribute("clip") || SHAPES[shape];
    // Clip-path is host-only CSS — applying it never needs the iframe
    // touched at all, so it's always cheap regardless of what else changed.
    this.style.clipPath = CSS.supports("clip-path",clip) ? clip : SHAPES.breach;

    const nextSrc = url.toString();
    if(this._frame && this._frame.isConnected){
      // Only reload the iframe (and only then) when an attribute that
      // actually changes what it renders changed — previously any observed
      // attribute mutation, including a purely cosmetic one like `label`
      // with an unchanged value or `clip`, rebuilt the whole shadow DOM and
      // forced a full reload of the portal simulation.
      if(this._frame.src !== nextSrc) this._frame.src = nextSrc;
      return;
    }

    this.shadowRoot.innerHTML = `<style>:host{display:block;position:relative;min-width:120px;min-height:120px;overflow:hidden;filter:drop-shadow(0 0 1px rgba(255,255,255,.9)) drop-shadow(0 0 16px rgba(255,45,146,.3));contain:layout paint}iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:transparent}</style>`;
    const frame = document.createElement("iframe");
    frame.title = "MOSH Forge Journey live visual";
    frame.loading = "lazy";
    frame.allow = "autoplay";
    frame.src = nextSrc;
    frame.addEventListener("load",()=>this.setAttribute("data-ready",""),{once:true});
    this.shadowRoot.append(frame);
    this._frame = frame;
  }
}

if(!customElements.get("mosh-journey-portal")) customElements.define("mosh-journey-portal",MoshJourneyPortal);
