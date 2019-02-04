import Snap from 'snapsvg';
import intersection from './intersection.svg';

// simple promise timeout
function wait(timeout) {
  return new Promise(resolve => {
    setTimeout(resolve, timeout);
  });
}

class TrafficIntersection {
  // injects the SVG content into the DOM
  static load() {
    if (this.loaded) return;
    let root = document.querySelector('#root');
    root.innerHTML = intersection;
    root.firstChild.id = 'intersection';
    this.loaded = true;
  }

  // create a new singleton instance to start things off
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
    this.svg = new Snap('#intersection');

    // start light timing
    this.timer = this.loop();
  }

  // simple mutable state
  state = {
    lastUpdate: 0,
    trafficDir: 'north-south',
    turnOnly: false
  };

  loop = (now = performance.now()) => {
    let { lastUpdate: last } = this.state;

    if (!last || now - last >= 20000) {
      console.log('20 sec');
      this.changeLight();
      this.state.lastUpdate = now;
    }

    requestAnimationFrame(this.loop);
  }

  changeLane(dir, lane, color) {
    // support multiple directions at once
    dir.split('-').forEach(d => {
      // change all lanes for a direction
      this.svg.selectAll(`.${d} .street-light--${lane}`)
        .forEach(light => {
          // reset all lights
          light.selectAll('.red,.yellow,.green')
            .forEach(el => el.removeClass('flashing'))
            .attr({ opacity: 0.1 });

          // flashing yellow is handled differently
          if (color === 'flashing') {
            light.select('.yellow')
              .attr({ opacity: 1 })
              .addClass('flashing');

          // make the desired light visible
          } else {
            light.select(`.${color}`)
              .attr({ opacity: 1 });
          }
        });
    });
  }

  async changeLight() {
    let { trafficDir, turnOnly } = this.state;
    let oppositeDir = trafficDir === 'north-south' ? 'east-west' : 'north-south';

    // change straight lights to yellow
    this.changeLane(trafficDir, 'straight', 'yellow');
    // change flashing yellow turn to solid
    this.changeLane(trafficDir, 'left', 'yellow');
    // change all yellow lights to red after 2 seconds
    await wait(2000);
    this.changeLane(trafficDir, 'straight', 'red');
    this.changeLane(trafficDir, 'left', 'red');
    // change other lane turn lights to green after 2 seconds
    await wait(2000);
    this.changeLane(oppositeDir, 'left', 'green');
    // change other lane turn lights to flashing yellow after 5 seconds
    await wait(5000);
    this.changeLane(oppositeDir, 'left', 'flashing');
    // change other lane straight lights to green after 1 second
    await wait(1000);
    this.changeLane(oppositeDir, 'straight', 'green');
    // update direction
    this.state.trafficDir = oppositeDir;
  }
}

// kick things off
TrafficIntersection.start();
