/* Fabrik — drivable cars + a simple grappler.
 * A Car is spawned on the parking lot by the Car Factory. The player presses E
 * to get in/out. Arcade driving with soft collisions. */
var FAB = window.FAB || (window.FAB = {});

FAB.Car = function (x, y, color, kind) {
  this.x = x; this.y = y;          // pixel centre
  this.angle = -Math.PI / 2;       // facing up
  this.speed = 0;                  // px/s along facing
  this.color = color || 'red';
  this.kind = kind || 'basic';     // basic | sporty | super
  this.hasSpoiler = (kind === 'sporty' || kind === 'super');
  this.hasGrappler = (kind === 'super');
  this.grab = null;                // grappled target {kind,ref} or thrown item
  this.grabT = 0;
};

FAB.Car.prototype.stats = function () {
  var base = { topSpeed: 230, accel: 260, turn: 2.4 };
  if (this.hasSpoiler) { base.topSpeed += 130; base.turn += 0.8; base.accel += 120; }
  return base;
};

FAB.Car.prototype.colorHex = function () {
  for (var i = 0; i < FAB.CAR_COLORS.length; i++) if (FAB.CAR_COLORS[i].id === this.color) return FAB.CAR_COLORS[i].hex;
  return '#e74c3c';
};

FAB.Car.prototype.update = function (dt, game) {
  var inp = game.input, s = this.stats();
  var throttle = (inp.held('up') ? 1 : 0) - (inp.held('down') ? 1 : 0);
  var steer = (inp.held('right') ? 1 : 0) - (inp.held('left') ? 1 : 0);
  // accelerate / brake / friction
  if (throttle !== 0) this.speed += throttle * s.accel * dt;
  this.speed *= (1 - 1.4 * dt); // drag
  if (inp.held('handbrake')) this.speed *= (1 - 4 * dt);
  this.speed = FAB.clamp(this.speed, -s.topSpeed * 0.5, s.topSpeed);
  // steering scales with speed
  if (Math.abs(this.speed) > 4) this.angle += steer * s.turn * dt * (this.speed > 0 ? 1 : -1) * FAB.clamp(Math.abs(this.speed) / 120, 0.3, 1);

  var nx = this.x + Math.cos(this.angle) * this.speed * dt;
  var ny = this.y + Math.sin(this.angle) * this.speed * dt;
  // soft collision with water/edges: bounce back gently
  if (game.canDrive(nx, this.y)) this.x = nx; else this.speed *= -0.3;
  if (game.canDrive(this.x, ny)) this.y = ny; else this.speed *= -0.3;

  // grappler
  if (this.hasGrappler && inp.pressed('grapple')) this.toggleGrapple(game);
  if (this.grab) {
    // carry the grabbed thing in front of the car
    var gx = this.x + Math.cos(this.angle) * 42, gy = this.y + Math.sin(this.angle) * 42;
    this.grab.x = gx; this.grab.y = gy;
  }
};

FAB.Car.prototype.toggleGrapple = function (game) {
  if (this.grab) { // throw it forward
    if (this.grab.thrown !== undefined) this.grab.thrown = true;
    game.toast('Threw it! 💥'); this.grab = null; return;
  }
  // find nearest grabbable prop within reach
  var reach = 90 * 90, best = null, bd = reach;
  for (var i = 0; i < game.props.length; i++) {
    var p = game.props[i];
    var d = FAB.dist2(this.x, this.y, p.x, p.y);
    if (d < bd) { bd = d; best = p; }
  }
  if (best) { this.grab = best; game.toast('Grabbed! 🧲'); FAB.sfx('grapple'); }
  else game.toast('Nothing to grab');
};
