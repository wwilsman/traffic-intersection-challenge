import Snap from 'snapsvg';

// do not use parcel-plugin-inlinesvg as we cannot configure SVGO to
// keep our SVG as-is with symbols and proper ids
const intersection = require('fs')
  .readFileSync('./intersection.svg', 'utf8')
  .replace(/^<\?.*?\n/, '');

const { random, floor } = Math;
const { keys, entries } = Object;

// simple promise timeout
function wait(timeout) {
  return new Promise(resolve => {
    setTimeout(resolve, timeout);
  });
}

// returns a random item from an array
function getRandItem(arr = []) {
  return arr[floor(random() * arr.length)];
}

// returns a random vehicle ID
function getRandVehicleId() {
  let ids = ['r', 'g', 'b', 's', 'p', 't'];
  return `#car-${getRandItem(ids)}`;
}

// returns a random direction and lane number from the available lanes
function getRandLane(lanes) {
  let dir = getRandItem(keys(lanes));
  let lane = getRandItem(lanes[dir])
  return [dir, lane];
}

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
    let { lights } = this.state;
    let key = (dir === 'north' || dir === 'south') ? 'north-south' : 'east-west';
    return lane === 3 || // right turn can always turn
      (lights[key] === 'go' && lane > 0 && lane < 3);
  }

  calcTransform(dir, lane, pos, index = 0) {
    let { vehicles } = this.state;
    let laneOffset = 60 * lane; // lane width 60
    let posOffset = 100 * index; // car height 100
    let r = 0, x = 0, y = 0;

    if (dir === 'north') {
      r = 180; // face south
      x = 506 - laneOffset; // lanes start at 506 and descrease
      y = pos === 'stop' ? 180 - posOffset // stop line is at 180
        : pos === 'start' ? -100 - posOffset // off screen
        : 1230 - posOffset; // other side
    } else if (dir === 'south') {
      x = 524 + laneOffset; // lanes start at 524 and increase
      y = pos === 'stop' ? 850 + posOffset // stop line is at 180
        : pos === 'start' ? 1130 + posOffset // off screen
        : -200 + posOffset; // other side
    } else if (dir === 'east') {
      r = 270; // face west
      y = 506 - laneOffset; // lanes start at 506 and descrease
      x = pos === 'stop' ? 850 + posOffset // stop line is at 850
        : pos === 'start' ? 1130 + posOffset // off screen
        : -200 + posOffset; // other side
    } else if (dir === 'west') {
      r = 90; // face east
      y = 524 + laneOffset; // lanes start at 524 and increase
      x = pos === 'stop' ? 180 - posOffset // stop line is at 180
        : pos === 'start' ? -100 - posOffset // off screen
        : 1230 - posOffset; // other side
    }

    // return raw values along with a transform string
    return { r, x, y, t: `t${x},${y} r${r}` };
  }

  // calculates the turning path for a turn lane
  calcTurn(dir, lane, index) {
    let { r, x, y } = this.calcTransform(dir, lane, 'stop', index);
    let startOffset = 200 * (index + 1); // start the car back off screen
    let turnOffset = 142; // how far the next lane is from this lane
    let laneStart, laneEnd, turnStart, curve;

    if (dir === 'north') {
      r += 90; // adjust rotation relative to path
      laneStart = [x, y - startOffset];
      laneEnd = [-100, y + turnOffset]; // end off screen
      turnStart = [x, y + (turnOffset / 2)] // start turning halfway through
      curve = [
        [x, y + turnOffset], // bezier 1
        [x - (turnOffset / 2), y + turnOffset], // bezier 2
        [x - turnOffset, y + turnOffset] // end of turn
      ];
    } else if (dir === 'south') {
      r -= 90; // adjust rotation relative to path
      laneStart = [x, y + startOffset];
      laneEnd = [1130, y - turnOffset]; // end off screen
      turnStart = [x, y - (turnOffset / 2)] // start turning halfway through
      curve = [
        [x, y - turnOffset], // bezier 1
        [x + (turnOffset / 2), y - turnOffset], // bezier 2
        [x + turnOffset, y - turnOffset] // end of turn
      ];
    } else if (dir === 'east') {
      laneStart = [x + startOffset, y];
      laneEnd = [x - turnOffset, -100]; // end off screen
      turnStart = [x - (turnOffset / 2), y] // start turning halfway through
      curve = [
        [x - turnOffset, y], // bezier 1
        [x - turnOffset, y - (turnOffset / 2)], // bezier 2
        [x - turnOffset, y - turnOffset] // end of turn
      ];
    } else if (dir === 'west') {
      r += 180; // adjust rotation relative to path
      laneStart = [x - startOffset, y];
      laneEnd = [x + turnOffset, 1130]; // end off screen
      turnStart = [x + (turnOffset / 2), y] // start turning halfway through
      curve = [
        [x + turnOffset, y], // bezier 1
        [x + turnOffset, y + (turnOffset / 2)], // bezier 2
        [x + turnOffset, y + turnOffset] // end of turn
      ];
    }

    return {
      r, x, y,
      d: `M${laneStart} L${turnStart} C${curve.join(' ')} L${laneEnd}`
    };
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
    // right turns start offscreen, so ignore them during positioning
    let canDrive = this.canDrive(dir, lane) && lane < 3;
    let index = vehicles[dir][lane].length;

    // position in the lane
    let { t: start } = this.calcTransform(dir, lane, 'start', index);
    let { t: end } = this.calcTransform(dir, lane, !canDrive && 'stop', index);

    // TODO: turning
    vehicle
      .appendTo(this.svg.select('.cars'))
      .transform(start)
      .animate(
        { transform: end },
        canDrive ? 3000 : 1000,
        canDrive ? mina.linear : mina.easein
      );

    // track all vehicles stopping at the intersection
    if (!canDrive) {
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

  pingVehicles() {
    let { lights, vehicles } = this.state;

    entries(vehicles).forEach(([dir, road]) => {
      road.forEach(async (lane, l) => {
        // empty lane
        if (lane.length === 0) return;

        if (this.canDrive(dir, l)) {
          // left turn
          if (l === 0) {
            // TODO

          // straight
          } else if (l < 3) {
            lane.forEach(async (vehicle, i) => {
              await wait(200 * i + floor(100 * random())); // cars don't start at the same time
              let { t } = this.calcTransform(dir, l, 'end', i);
              vehicle.animate({ transform: t }, 2200, mina.easeout, vehicle.remove);
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

          // right turn
          } else if (l === 3) {
            lane.forEach((vehicle, i) => {
              let p = this.calcTurn(dir, l, i);
              let path = this.svg.path(p.d).attr({ fill: 'none' });
              let len = Snap.path.getTotalLength(path);

              // animate along the generated path
              Snap.animate(0, len, step => {
                let point = Snap.path.getPointAtLength(path, step);
                let r = point.alpha + p.r; // offset rotation relative to path
                let y = point.y - 50; // pivot closer to the back of the car
                let x = point.x;

                vehicle.transform(`t${x},${y} r${r},0,50`);
              }, 2000, mina.linear, () => {
                vehicle.remove();
                path.remove();
              });
            });

            this.update({
              vehicles: {
                [dir]: [
                  ...this.state.vehicles[dir].slice(0, l),
                  [] // lane should now be empty
                ]
              }
            });
          }
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
