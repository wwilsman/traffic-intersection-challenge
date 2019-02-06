import Snap from 'snapsvg';

import {
  wait,
  getRandLane,
  getRandVehicleId,
  calcTransform,
  calcTurnPath
} from './utils';

// do not use parcel-plugin-inlinesvg as we cannot configure SVGO to
// keep our SVG as-is with symbols and proper ids
const intersection = require('fs')
  .readFileSync(`./src/intersection.svg`, 'utf8') // root relative
  .replace(/^<\?.*?\n/, '');

const { mina } = window; // snap.svg adds this globally
const { random, floor } = Math;
const { keys, entries } = Object;

// This doesn't need to be a class, but instead could be a series of
// functional callbacks, especially since it's a singleton. The class
// syntax just provides some nice isolation of state within the
// context of the intersection
class TrafficIntersection {
  // injects the SVG content into the DOM
  static load() {
    if (this.loaded) return;
    let root = document.querySelector('#root');
    root.innerHTML = intersection;
    this.loaded = true;
  }

  // create a new singleton instance to start things off
  static start(options) {
    if (!this.loaded) this.load();
    this.instance = this.instance || new TrafficIntersection(options);
    return this.instance;
  }

  // cleanup animation frame and root element
  static stop() {
    cancelAnimationFrame(this.instance._animframeid);
    let root = document.querySelector('#root');
    root.innerHTML = '';
  }

  constructor({ timing, rate }) {
    // there can only be one
    if (this.constructor.instance) {
      return this.constructor.instance;
    }

    // save options
    this.options = { timing, rate };

    // use Snap.svg to animate things
    this.svg = new Snap('#intersection');

    // start looping
    this.loop();
  }

  // simple state
  state = {
    lastChange: 0,
    lastVehicle: 0,

    lights: {
      // turn, go, stop
      'north-south': 'go',
      'east-west': 'stop'
    },

    // dir + lane number
    vehicles: {
      north: [[], [], [], []],
      south: [[], [], [], []],
      east: [[], [], [], []],
      west: [[], [], [], []]
    }
  };

  // simple state update
  update(state) {
    this.state = {
      ...this.state,
      ...state,
      // lights update
      lights: {
        ...this.state.lights,
        ...state.lights
      },
      // vehicles update
      vehicles: {
        ...this.state.vehicles,
        ...state.vehicles
      }
    };
  }

  // animation loop
  loop = (now = performance.now()) => {
    let { lastChange, lastVehicle } = this.state;

    // traffic light update
    if (!lastChange || now - lastChange >= this.options.timing) {
      this.update({ lastChange: now });
      this.changeLight();
    }

    // vehicle spawn / response rate
    if (!lastVehicle || now - lastVehicle >= this.options.rate) {
      this.update({ lastVehicle: now });
      this.addRandomVehicle();
      this.pingVehicles();
    }

    // loop again
    this._animframeid = requestAnimationFrame(this.loop);
  }

  changeLane(dir, lane, color) {
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
    let { lights } = this.state;
    let trafficDir = keys(lights).find(k => lights[k] === 'go');
    let oppositeDir = keys(lights).find(k => lights[k] === 'stop');

    // change straight lights to yellow
    this.changeLane(trafficDir, 'straight', 'yellow');
    // change flashing yellow turn to solid
    this.changeLane(trafficDir, 'left', 'yellow');
    // start stopping on yellow
    this.update({ lights: { [trafficDir]: 'stop' } });
    // change all yellow lights to red after 2 seconds
    await wait(2000);
    this.changeLane(trafficDir, 'straight', 'red');
    this.changeLane(trafficDir, 'left', 'red');

    // change other lane turn lights to green after 2 seconds
    await wait(2000);
    this.changeLane(oppositeDir, 'left', 'green');
    // update direction for turning lane only
    this.update({ lights: { [oppositeDir]: 'turn' } });
    // change other lane turn lights to flashing yellow after 5 seconds
    await wait(5000);
    this.changeLane(oppositeDir, 'left', 'flashing');
    // change other lane straight lights to green after 1 second
    await wait(1000);
    this.changeLane(oppositeDir, 'straight', 'green');
    // update so straight traffic can go
    this.update({ lights: { [oppositeDir]: 'go' } });
  }

  canDrive(dir, lane) {
    let { lights, vehicles } = this.state;
    let key = (dir === 'north' || dir === 'south') ? 'north-south' : 'east-west';

    // determine if the opposite lane has oncoming traffic
    let oppLanesEmpty = () => {
      let oppDir = dir === 'north' ? 'south'
        : dir === 'south' ? 'north'
          : dir === 'east' ? 'west'
            : 'east';
      return !vehicles[oppDir][1].length && !vehicles[oppDir][2].length;
    };

    return lane === 3 || // right turn can always turn
      (lights[key] === 'turn' && lane === 0) || // left turn only
      (lights[key] === 'go' && lane > 0 && lane < 3) || // straight lanes
      (lights[key] === 'go' && lane === 0 && oppLanesEmpty()); // left turn when opposite lane is empty
  }

  addRandomVehicle() {
    let { vehicles } = this.state;

    // get a random lane from all of the available lanes that have
    // space for more vehicles
    let [dir, lane] = getRandLane(
      entries(vehicles).reduce((lanes, [d, road]) => {
        // each lane has a max of 2 cars
        let avail = [...road.keys()].filter(l => road[l].length < 2);
        return avail.length ? { ...lanes, [d]: avail } : lanes;
      }, {})
    );

    // if there is no more room for vehicles, abort
    if ((dir || lane) == null) return;

    // get a random vehicle
    let vehicle = this.svg.use(getRandVehicleId());
    let index = vehicles[dir][lane].length;

    // position in the lane
    let start = calcTransform(dir, lane, 'start', index);
    vehicle.appendTo(this.svg.select('.cars')).transform(start.t);

    // drive
    this.drive(vehicle, dir, lane, index, true);

    // track all vehicles stopping at the intersection
    if (!this.canDrive(dir, lane)) {
      this.update({
        vehicles: {
          [dir]: [
            ...vehicles[dir].slice(0, lane),
            vehicles[dir][lane].concat(vehicle),
            ...vehicles[dir].slice(lane + 1)
          ]
        }
      });
    }
  }

  drive(vehicle, dir, lane, index, offscreen) {
    // can't drive, pull up
    if (!this.canDrive(dir, lane)) {
      let end = calcTransform(dir, lane, 'stop', index);
      vehicle.animate({ transform: end.t }, 1000, mina.easein);

    // turning lanes
    } else if (lane === 0 || lane === 3) {
      let p = calcTurnPath(dir, lane, index, offscreen);
      let path = this.svg.path(p.d).attr({ fill: 'none' });
      let len = Snap.path.getTotalLength(path);
      let ease = lane === 0 ? mina.easeout : mina.linear;
      let duration = offscreen && lane === 0 ? 2400 : 2000;

      // animate along the generated path
      Snap.animate(0, len, step => {
        let point = Snap.path.getPointAtLength(path, step);
        let r = point.alpha + p.r; // offset rotation relative to path
        let y = point.y - 50; // pivot closer to the back of the car
        let x = point.x;

        vehicle.transform(`t${x},${y} r${r},0,50`);
      }, duration, ease, () => {
        vehicle.remove();
        path.remove();
      });

    // straight lanes
    } else {
      let end = calcTransform(dir, lane, 'end', index);
      vehicle.animate({ transform: end.t }, 2200, mina.easeout, vehicle.remove);
    }
  }

  // cars that are able to drive should try
  pingVehicles() {
    entries(this.state.vehicles).forEach(([dir, road]) => {
      road.forEach(async (lane, l) => {
        if (lane.length === 0) return;

        if (this.canDrive(dir, l)) {
          lane.forEach(async (v, i) => {
            // cars don't start at the same time
            await wait(200 * i + floor(100 * random()));
            this.drive(v, dir, l, i);
          });

          // wait half the rate before considering the lane empty
          await wait(this.options.rate / 2);

          this.update({
            vehicles: {
              [dir]: [
                ...this.state.vehicles[dir].slice(0, l),
                [], // lane should now be empty
                ...this.state.vehicles[dir].slice(l + 1)
              ]
            }
          });
        }
      });
    });
  }
}

// kick things off
TrafficIntersection.start({
  timing: 20000,
  rate: 1000
});
