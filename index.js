import Snap from 'snapsvg';
import svg from './intersection.svg';


class TrafficIntersection {
  static load() {
    if (this.loaded) return;
    let root = document.querySelector('#root');
    root.innerHTML = svg;
    root.firstChild.id = 'intersection';
    this.loaded = true;
  }

  static start() {
    if (!this.loaded) this.load();
    this.instance = this.instance || new TrafficIntersection();
    return this.instance;
  }

  constructor() {
    // there can only be one
    if (this.constructor.instance) {
      return this.constructor.instance;
    }

    // use Snap.svg to animate things
    this.snap = new Snap('#intersection');
  }
}

// kick things off
TrafficIntersection.start();
