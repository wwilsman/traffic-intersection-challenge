import Snap from 'snapsvg';

// do not use parcel-plugin-inlinesvg as we cannot configure SVGO to
// keep our SVG as-is with symbols and proper ids
const intersection = require('fs')
  .readFileSync('./intersection.svg', 'utf8')
  .replace(/^<\?.*?\n/, '');

const { random, floor } = Math;

// simple promise timeout
function wait(timeout) {
  return new Promise(resolve => {
    setTimeout(resolve, timeout);
  });
}

// returns a random item from an array
function getRandItem(arr) {
  return arr[floor(random() * arr.length)];
}

// returns a random vehicle ID
function getRandVehicleId() {
  let ids = ['r', 'g', 'b', 's', 'p', 't'];
  return `#car-${getRandItem(ids)}`;
}

// returns a random direction and lane number
function getRandLane() {
  let dirs = ['north', 'south', 'east', 'west'];
  return [getRandItem(dirs), getRandItem([0, 1, 2, 3])];
}

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
    this._animframeid = this.loop();
  }

  // simple state
  state = {
    lastChange: 0,
    lastVehicle: 0,
    trafficDir: 'north-south',
    turnOnly: false,

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
      ...state
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

    // vehicle spawn rate
    if (!lastVehicle || now - lastVehicle >= this.options.rate) {
      this.update({ lastVehicle: now });
      this.addRandomVehicle();
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
    let { trafficDir } = this.state;
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
    // update direction for turning lane only
    this.update({ trafficDir: oppositeDir, turnOnly: true });
    // change other lane turn lights to flashing yellow after 5 seconds
    await wait(5000);
    this.changeLane(oppositeDir, 'left', 'flashing');
    // change other lane straight lights to green after 1 second
    await wait(1000);
    this.changeLane(oppositeDir, 'straight', 'green');
    // update so straight traffic can go
    this.update({ turnOnly: false });
  }

  addRandomVehicle() {
    let [dir, lane] = getRandLane();
    let road = this.state.vehicles[dir];

    // no more than 2 vehicles allowed in any lane
    if (road[lane].length >= 2) return;

    // TODO: if we want to gaurantee a new vehicle, we need to
    // optimize the random lane function to not account for spaces
    // where there is already a car; otherwise the not-so-random JS
    // `random` function will slow down the run loop as it misses
    // empty spaces.

    // while (road[lane].length >= 2) {
    //   [dir, lane] = getRandLane();
    //   road = this.state.vehicles[dir];
    // }

    // get a random vehicle and position it into a lane behind any
    // other vehicles in the lane
    let vehicle = this.svg.use(getRandVehicleId());
    let x = 60 * lane; // lane width 60
    let y = 100 * road[lane].length; // car height 100

    if (dir === 'north') {
      // lane 0 is 506-, stop line is 180-
      vehicle.transform(`t${506 - x},${180 - y} r180`);
    } else if (dir === 'south') {
      // lane 0 is 524+, stop line is 850+
      vehicle.transform(`t${524 + x},${850 + y}`);
    } else if (dir === 'east') {
      // lane 0 is 850+, stop line is 506-
      vehicle.transform(`t${850 + y},${506 - x} r270`);
    } else if (dir === 'west') {
      // lane 0 is 180-, stop line is 524+
      vehicle.transform(`t${180 - y},${524 + x} r90`);
    }

    // track all vehicles coming through the intersection
    this.update({
      vehicles: {
        ...this.state.vehicles,
        [dir]: [
          ...road.slice(0, lane),
          road[lane].concat(vehicle),
          ...road.slice(lane + 1)
        ]
      }
    });
  }
}

// kick things off
TrafficIntersection.start({
  timing: 20000,
  rate: 1000
});
