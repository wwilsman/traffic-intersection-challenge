import Snap from 'snapsvg';

class TrafficIntersection {
  static start() {
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
