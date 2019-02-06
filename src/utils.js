const { keys } = Object;
const { floor, random } = Math;

// simple promise timeout
export function wait(timeout) {
  return new Promise(resolve => {
    setTimeout(resolve, timeout);
  });
}

// returns a random item from an array
export function getRandItem(arr = []) {
  return arr[floor(random() * arr.length)];
}

// returns a random vehicle ID
export function getRandVehicleId() {
  let ids = ['r', 'g', 'b', 's', 'p', 't'];
  return `#car-${getRandItem(ids)}`;
}

// returns a random direction and lane number from the available lanes
export function getRandLane(lanes) {
  let dir = getRandItem(keys(lanes));
  let lane = getRandItem(lanes[dir]);
  return [dir, lane];
}

// calculates the transform properties for a vehicle in a lane
export function calcTransform(dir, lane, pos, index = 0) {
  let laneOffset = 60 * lane; // lane width 60
  let posOffset = 100 * index; // car height 100
  let r = 0; let x = 0; let y = 0;

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

// calculates the turning path for a right turn lane
export function calcRightTurnPath(dir, index) {
  let { r, x, y } = calcTransform(dir, 3, 'stop', index);
  let startOffset = 200 * (index + 1); // start the car back off screen
  let turnOffset = 142; // how far the next lane is from this lane
  let laneStart, laneEnd, turnStart, curve;

  if (dir === 'north') {
    r += 90; // adjust rotation relative to path
    laneStart = [x, y - startOffset];
    laneEnd = [-100, y + turnOffset]; // end off screen
    turnStart = [x, y + (turnOffset / 2)]; // start turning halfway through
    curve = [
      [x, y + turnOffset], // bezier 1
      [x - (turnOffset / 2), y + turnOffset], // bezier 2
      [x - turnOffset, y + turnOffset] // end of turn
    ];
  } else if (dir === 'south') {
    r -= 90; // adjust rotation relative to path
    laneStart = [x, y + startOffset];
    laneEnd = [1130, y - turnOffset]; // end off screen
    turnStart = [x, y - (turnOffset / 2)]; // start turning halfway through
    curve = [
      [x, y - turnOffset], // bezier 1
      [x + (turnOffset / 2), y - turnOffset], // bezier 2
      [x + turnOffset, y - turnOffset] // end of turn
    ];
  } else if (dir === 'east') {
    laneStart = [x + startOffset, y];
    laneEnd = [x - turnOffset, -100]; // end off screen
    turnStart = [x - (turnOffset / 2), y]; // start turning halfway through
    curve = [
      [x - turnOffset, y], // bezier 1
      [x - turnOffset, y - (turnOffset / 2)], // bezier 2
      [x - turnOffset, y - turnOffset] // end of turn
    ];
  } else if (dir === 'west') {
    r += 180; // adjust rotation relative to path
    laneStart = [x - startOffset, y];
    laneEnd = [x + turnOffset, 1130]; // end off screen
    turnStart = [x + (turnOffset / 2), y]; // start turning halfway through
    curve = [
      [x + turnOffset, y], // bezier 1
      [x + turnOffset, y + (turnOffset / 2)], // bezier 2
      [x + turnOffset, y + turnOffset] // end of turn
    ];
  }

  return {
    r,
    x,
    y,
    d: `M${laneStart} L${turnStart} C${curve.join(' ')} L${laneEnd}`
  };
}

// calculates the turning path for a left turn lane, when offscreen is
// `true` the path should begin off screen
export function calcLeftTurnPath(dir, index, offscreen) {
  let { r, x, y } = calcTransform(dir, 0, 'stop', index);
  let startOffset = 100 * index; // starting offset based on lane index
  let turnOffset = 404; // how far the next lane is from this lane
  let laneStart, laneEnd, turnStart, curve;

  if (dir === 'north') {
    r += 90; // adjust rotation relative to path
    laneStart = offscreen ? [x, -100] : [x, y - 50]; // offset to prevent jumping due to rotation offset
    laneEnd = [1030, y + startOffset + turnOffset]; // end off screen
    turnStart = [x, y + startOffset + (turnOffset / 4)]; // start turning
    curve = [
      [x, y + (turnOffset / 2) + startOffset], // bezier 1
      [x + (turnOffset / 4), y + turnOffset + startOffset], // bezier 2
      [x + turnOffset, y + turnOffset + startOffset] // end of turn
    ];
  } else if (dir === 'south') {
    r -= 90; // adjust rotation relative to path
    laneStart = offscreen ? [x, 1130] : [x, y + 50]; // offset to prevent jumping due to rotation offset
    laneEnd = [-100, y - startOffset - turnOffset]; // end off screen
    turnStart = [x, y - startOffset - (turnOffset / 4)]; // start turning
    curve = [
      [x, y - (turnOffset / 2) - startOffset], // bezier 1
      [x - (turnOffset / 4), y - turnOffset - startOffset], // bezier 2
      [x - turnOffset, y - turnOffset - startOffset] // end of turn
    ];
  } else if (dir === 'east') {
    if (offscreen) laneStart = [1130, y]; // start offscreen
    laneStart = offscreen ? [1130, y] : [x + 50, y]; // offset to prevent jumping due to rotation offset
    laneEnd = [x - turnOffset - startOffset, 1130]; // end off screen
    turnStart = [x - (turnOffset / 4) - startOffset, y]; // start turning
    curve = [
      [x - (turnOffset / 2) - startOffset, y], // bezier 1
      [x - turnOffset - startOffset, y + (turnOffset / 4)], // bezier 2
      [x - turnOffset - startOffset, y + turnOffset] // end of turn
    ];
  } else if (dir === 'west') {
    r += 180; // adjust rotation relative to path
    laneStart = offscreen ? [-100, y] : [x - 50, y]; // offset to prevent jumping due to rotation offset
    laneEnd = [x + turnOffset + startOffset, -100]; // end off screen
    turnStart = [x + (turnOffset / 4) + startOffset, y]; // start turning halfway through
    curve = [
      [x + (turnOffset / 2) + startOffset, y], // bezier 1
      [x + turnOffset + startOffset, y - (turnOffset / 4)], // bezier 2
      [x + turnOffset + startOffset, y - turnOffset] // end of turn
    ];
  }

  return {
    r,
    x,
    y,
    d: `M${laneStart} L${turnStart} C${curve.join(' ')} L${laneEnd}`
  };
}

// calculates the left or right turn lane path
export function calcTurnPath(dir, lane, index, offscreen) {
  if (lane === 0) {
    return calcLeftTurnPath(dir, index, offscreen);
  } else {
    return calcRightTurnPath(dir, index);
  }
}
