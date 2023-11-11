/*******************************************************************
Program "Three Bodies Problem", RKF45 Method
Real time integration with Runge-Kutta-Fehlberg method 4th-5rd Order 
with step control.
By George Papademetriou, PhD (Physics), February 2023 

Issues:
1) The RKF45 doesn't work fully properly when gravity is very strong
2) The energy doesn't seem to be constant as it should... (solved)
Update: I corrected the RKF45 method and now it works propperly.
Only when the distance between the planets becomes extremelly small 
the time step size gets very small (<1e-5) and sometimes the two 
planets gain anexpected high velocities and go to infinity...

Whatever! It was fun to code, learning the TypeScript format!

by JorgePap, April 2023, version 4 (RKF45 working fine) ...
********************************************************************
*/

// program variables
let canvas: any;
let ctx: any;
let canvasWidth: number = 1000;
let canvasHeight: number = 600;
let planet1: Planet;
let planet2: Planet;
let planet3: Planet;
let cordSys : CoordSystem;
const trailPoint1: any = [];
const trailPoint2: any = [];
const trailPoint3: any = [];
// physics variables
let G: number = 6.67e-11; // gravitational constant in SI
let t: number = 0; // the global time
// boolean flags for varius controls
let isPaused: boolean = false;
let hasCollisions: boolean = false;
let hasTrails: boolean = true;
let showAccel: boolean = true;
let showVel: boolean = true;
let addPoint: boolean = true;

// Runge-Kutta Simulation variables
const err: number = 0.005; // max desired error
let dt: number = 0.132; // time step in seconds, 132ms
let tStep: number = dt;
const dt_min = 1e-6; // min allowed step (sec)
const dt_max = 132e-3; // max allowed step (sec)

// Butcher tableau for Fehlberg's 4(5) method (classic)
// A is not used as the derivatives do not depend on time
let A: number[] = [0, 1/4,  3/8, 12/13,  1,   1/2]; 
let B: number[][] = 
  [[        0,          0,           0,          0,      0], 
   [      1/4,          0,           0,          0,      0], 
   [     3/32,       9/32,           0,          0,      0],
   [1932/2197, -7200/2197,   7296/2197,          0,      0],
   [  439/216,         -8,    3680/513,  -845/4104,      0],
   [    -8/27,          2,  -3544/2565,  1856/4104, -11/40]];
let C4: number[] = [25/216, 0,  1408/2565,   2197/4104,  -1/5,     0];
let C5: number[] = [16/135, 0, 6656/12825, 28561/56430, -9/50,  2/55];
// E is the difference C5-C4 number array for calculating the 4th process error
let E: number[] =  [-1/360, 0,   128/4275,  2197/75240, -1/50, -2/55]

document.addEventListener('DOMContentLoaded', SetupCanvas);

// initialize the stage of the simulation
function SetupCanvas(){
  // Get the canvas element form the page
  canvas = document.getElementById('my-canvas') as HTMLCanvasElement;
  /* Resize the canvas to occupy the full page, 
  by getting the window width and height and setting it to canvas
  */
  // canvas.width = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
  // canvas.height = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
  // Reduce a little the sizes
  // canvas.width -= 40;
  // canvas.height -= 40;

  // alternative: fixed sized canvas
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
 
  // clear the stage
  ctx = canvas.getContext("2d");
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  //Coordinate system for zooming and paning the view 
  cordSys = new CoordSystem;

  // create 3 planets
  planet1 = new Planet();
  planet1.setColor(`rgba(0, 255, 255, 1`);
  planet2 = new Planet();
  planet2.setColor(`rgba(255, 0, 255, 1`);
  planet3 = new Planet();
  planet3.setColor(`rgba(255, 255, 0, 1`);
  
  // set initial conditions 
  // (Pythagorean solution - one planet escapes)

  planet1.setMass(3*10**12);
  planet1.setPos(500-40, 300-120);
  planet1.setVelocity(0,0);
  planet2.setMass(4*10**12);
  planet2.setPos(500+80, 300+40);
  planet2.setVelocity(0,0);
  planet3.setMass(5*10**12);
  planet3.setPos(500-40, 300+40);
  planet3.setVelocity(0,0);

  // play the game
  Render(t);
}

/**
 * CoordSystem Class
 * for handling zooming and paning the view window
 */
class CoordSystem {
  constructor (
    x0: number = 0,
    y0: number = 0,
    scale: number = 1,
    viewWidth : number = 1000,
    viewHeight : number = 600
  ) {
    this.x0 = x0;
    this.y0 = y0;
    this.scale = scale;
    this.viewWidth = viewWidth;
    this.viewHeight = viewHeight
  }
  x0: number;
  y0: number;
  scale: number;
  viewWidth: number;
  viewHeight: number;

  setUp(vW: number, vH: number) {
    this.viewWidth = vW;
    this.viewHeight = vH;
  }
  
  X(x:number) : number {
    return (x-this.x0)*this.scale
  }

  Y(y:number) : number {
    return (y-this.y0)*this.scale
  }

  S(x: number) : number {
    return x*this.scale
  }

  getX() : number {
    return this.x0;
  }

  getY() : number {
    return this.y0;
  }

  getScale() : number {
    return this.scale;
  }

  reduceScale() {
    throw new Error("Method not implemented.");
  }

  setX(x: number) : void {
    this.x0 = x;
  }

  setY(y: number) : void {
    this.y0 = y;
  }

  setScale(s: number) : void {
    this.scale = s;
  }

  convert(x: number, y: number) : number[] {
    return [(x - this.x0)*this.scale, (y - this.y0)*this.scale]
  }
}

/**
 * The basic object of the simulation, a planet
 */
class Planet {
  constructor(
      x: number = 500 + 200 - 400*Math.random(), y: number = 300 + 200 - 400*Math.random(),
      vx: number = 1 - 2*Math.random(), vy: number =  1 - 2*Math.random(), radius: number = 4, 
      mass: number = 10**12*(20 - 18*Math.random()), ax: number = 0.0, ay:number = 0.0, 
      c: string = "white") { 
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.radius = radius+0.2*mass/10**12;
    this.mass = mass;
    this.ax = ax;
    this.ay = ay;
    this.c = c;
  }
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  mass: number;
  ax: number;
  ay: number;
  c: string;

  update(x: number, y:number, vx: number, vy:number, ax:number, ay: number): void {
    // update code
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.ax = ax;
    this.ay = ay;
  }
  
  draw(): void {
    // draw code
    // circle (planet)
    ctx.strokeStyle = this.c;
    ctx.beginPath();
    ctx.arc(cordSys.X(this.x), cordSys.Y(this.y), cordSys.S(this.radius), 0, 2 * Math.PI, false);
    ctx.closePath();
    ctx.stroke();
    if (showVel) {
      // velocity vector in blue
      ctx.beginPath();
      ctx.strokeStyle = 'blue';
      ctx.moveTo(cordSys.X(this.x), cordSys.Y(this.y));
      ctx.lineTo(cordSys.X(this.x + this.vx/0.08), cordSys.Y(this.y + this.vy/0.08));
      ctx.closePath(); 
      ctx.stroke();
      //ctx.fill();
    }
    if (showAccel) {
      // acceleration vector in red
      ctx.beginPath();
      ctx.strokeStyle = 'red';
      ctx.moveTo(cordSys.X(this.x), cordSys.Y(this.y));
      ctx.lineTo(cordSys.X(this.x + this.ax/0.005), cordSys.Y(this.y + this.ay/0.005));
      ctx.closePath(); 
      ctx.stroke();
      //ctx.fill();
    } 
  }

  setColor(c: string) : void {
    this.c = c;
  }

  setMass(m: number) : void {
    this.mass = m;
  }

  setVelocity(v_x: number, v_y: number) : void {
    this.vx = v_x;
    this.vy = v_y;
  }

  setPos(x: number, y: number) : void {
    this.x = x;
    this.y = y;
  }
}

// basic drawing function
function Render(tElapsed: number) : void {
  // Render the scene!
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  planet1.draw();
  planet2.draw();
  planet3.draw();

  // arrays used in RKF45
  let x: Array<number> = [planet1.x, planet2.x, planet3.x]
  let y: Array<number> = [planet1.y, planet2.y, planet3.y]
  let vx: Array<number> = [planet1.vx, planet2.vx, planet3.vx]
  let vy: Array<number> = [planet1.vy, planet2.vy, planet3.vy]
  let m: Array<number> = [planet1.mass, planet2.mass, planet3.mass]

  // Update trail points
  if (Math.floor(t*20) % 2 === 0) {
    trailPoint1.push({ x: planet1.x, y: planet1.y });
    trailPoint2.push({ x: planet2.x, y: planet2.y });
    trailPoint3.push({ x: planet3.x, y: planet3.y });
    if (trailPoint1.length > 1450) {
      trailPoint1.shift();
      trailPoint2.shift();
      trailPoint3.shift();
    }
  }
  
  // Draw trail points if needed
  if (hasTrails) {
    for (let i = 0; i < trailPoint1.length; i++) {
      const point1 = trailPoint1[i];
      const point2 = trailPoint2[i];
      const point3 = trailPoint3[i];
      // fade out over distance
      const alpha = i / trailPoint1.length * 0.5; 
      ctx.beginPath();
      ctx.arc(cordSys.X(point1.x), cordSys.Y(point1.y), 1, 0, 2 * Math.PI);
      ctx.fillStyle = `rgba(0, 255, 255, ${alpha})`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cordSys.X(point2.x), cordSys.Y(point2.y), 1, 0, 2 * Math.PI);
      ctx.fillStyle = `rgba(255, 0, 255, ${alpha})`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cordSys.X(point3.x), cordSys.Y(point3.y), 1, 0, 2 * Math.PI);
      ctx.fillStyle = `rgba(255, 255, 0, ${alpha})`;
      ctx.fill();
    }
  }
  
  // check if we have any collisions if needed
  if (hasCollisions) {
    if (circleCollision(x[0], y[0], planet1.radius, x[1], y[1], planet2.radius)) {
      [vx[0], vy[0], vx[1], vy[1], ] = elasticColission(x[0], y[0], vx[0], vy[0], planet1.mass, 
        x[1], y[1], vx[1], vy[1], planet2.mass)
    }
    if (circleCollision(x[0], y[0], planet1.radius, x[2], y[2], planet3.radius)) {
      [vx[0], vy[0], vx[2], vy[2], ] = elasticColission(x[0], y[0], vx[0], vy[0], planet1.mass, 
        x[2], y[2], vx[2], vy[2], planet3.mass)
    }
    if (circleCollision(x[1], y[1], planet2.radius, x[2], y[2], planet3.radius)) {
      [vx[1], vy[1], vx[2], vy[2], ] = elasticColission(x[1], y[1], vx[1], vy[1], planet2.mass, 
        x[2], y[2], vx[2], vy[2], planet3.mass)
    }
  }

  // xf is the main vector returned by RKF45 step
  let xf: number[] = []; // empty array
  let dtNext : number = dt;  // next time step 

  /* 
  My take on Runge-Kutta addaptive method.
  The main deviation is that I don't use the returned next_step 
  from the RKFStep() function, as it tends to decrease the step
  even when it should increase it. Instead the next_step is defined
  manually as 0.8*this_step or 1.2*this_step
  */ 
  do {
    xf.length = 0;
    xf = RK4Step(x, y, vx, vy, m, dvdt, dt);
    // error
    if (xf[12] > err) {
      dtNext = 0.8*dt;
      if (dtNext < dt_min) {
        dtNext = dt_min;
        break;
      }
      dt = dtNext;
      continue;
    } else {
      dtNext = 1.2*dt;
      if (dtNext>dt_max) {
        dtNext=dt_max
      } 
      break;
    }
    // console.log(dt);
  } while (1>0) // for ever!
  // update time and set the next step
  t += dt;
  dt = dtNext;
 
  // update planets from Runge-Kutta step results
  planet1.update(xf[0], xf[3], xf[6], xf[9],  xf[14], xf[17]);
  planet2.update(xf[1], xf[4], xf[7], xf[10], xf[15], xf[18]);
  planet3.update(xf[2], xf[5], xf[8], xf[11], xf[16], xf[19]);
  // console.log("planets updated")
  
  // write messages in screen absolute position, not in coordinate system
  ctx.fillStyle = 'white';
  ctx.font = '14px Arial';
  if (hasCollisions) {
    ctx.fillText("Three Bodies interacting with gravity - with collisions", 10, 15);
  } else {
    ctx.fillText("Three Bodies interacting with gravity - No collisions", 10, 15);
  }
  ctx.font = '12px Arial';
  ctx.fillText("Calculating in real time with addaptive Runge-Kutta-Fehlberg (RK45) method", 10, 35);
  ctx.fillText("by George Papademetriou, 2023", 10, 50);
  ctx.fillText("Time t = " + t.toFixed(1) + " s", 10, 65);
  if (dt>=0.001) {
    ctx.fillText("Time step dt = " + (1000*dt).toFixed(0) + " ms", 10, 80);
  } else {
    ctx.fillText("Time step dt = " + (1000*dt).toExponential(0) + " ms", 10, 80);
  }
  let texty: number = canvasHeight - 12;
  ctx.fillText("A / V: show acceleration / velocity vecctors, C: toggle collisions, T: show trails, SpaceBar: freeze animation", 10, texty);
} // end of render function

/**
 * calc distance r between two points
 * @param x1 x1 coordinate
 * @param x2 x2 coordinate
 * @param y1 y1 coordinate
 * @param y2 y2 coordinate
 * @returns the Eucledian distance of two points
 */
function calcDistance(x1: number,x2: number, y1: number, y2 : number) : number {
  return 1*Math.sqrt((x1 - x2)**2.0 + (y1 - y2)**2.0);
}

/**
 * the v_x, v_y derivatives
 * @param x array of planets x coordinates
 * @param y array of planets y coordinates
 * @param m array of planets masses
 * @param t time (not used)
 * @returns the gravitational acceleration vector for every planet in array
 */
function dvdt(x: Array<number>, y: Array<number>, m: Array<number>, t: number) : number[] {
  let r01 = (calcDistance(x[0], x[1], y[0], y[1]))**3;
  let r02 = (calcDistance(x[0], x[2], y[0], y[2]))**3;
  let r12 = (calcDistance(x[1], x[2], y[1], y[2]))**3;
  return [
    // x coordinates 
    G*m[1]*(x[1] - x[0])/r01 + G*m[2]*(x[2] - x[0])/r02,
    G*m[0]*(x[0] - x[1])/r01 + G*m[2]*(x[2] - x[1])/r12,
    G*m[0]*(x[0] - x[2])/r02 + G*m[1]*(x[1] - x[2])/r12,
    // y coordinates
    G*m[1]*(y[1] - y[0])/r01 + G*m[2]*(y[2] - y[0])/r02,
    G*m[0]*(y[0] - y[1])/r01 + G*m[2]*(y[2] - y[1])/r12,
    G*m[0]*(y[0] - y[2])/r02 + G*m[1]*(y[1] - y[2])/r12
  ];
}

/**
 * the x derivatives
 * @param vx vx array coordinates
 * @param vy vx array coordinates
 * @param t time dt
 * @returns the vx array and the vy array
 */
function dxdt(vx: Array<number>, vy: Array<number>, t: number) : number[] {
  return [ vx[0], vx[1], vx[2], vy[0], vy[1], vy[2] ]
}

/**
 * Runge-Kutta Fehlberg step in x and y axis for the system
 * @param x array of x coordinates of planets
 * @param y array of y coordinates of planets
 * @param vx array of x velocities of planets 
 * @param vy array of velocities of planets
 * @param m array of masses of planets
 * @param der function of velocities derivatives in x, y directions (not used) 
 * @param dt time (used only for the steps)
 * @returns the x, v and a vectors for the planets, 
 * the estimated error and the new dt. 
 */
function RK4Step(x: Array<number>, y: Array<number>, vx: Array<number>, vy: Array<number>, m: Array<number>,
  der: (x: Array<number>, y: Array<number>, m: Array<number>, t1: number) => number[], 
  dt: number ) : Array<number> {
// initial values for x, y, vx, vy
var x0 = x;
var y0 = y;
var vx0 = vx;
var vy0 = vy;

// step 1
let kx1 = dxdt(vx, vy, dt).map(z => z * dt);
let kv1 = dvdt(x, y, m, dt).map(z => z * dt);

// step 2
let kx2 = dxdt(
  [vx[0] + B[1][0]*kv1[0],  vx[1] + B[1][0]*kv1[1],  vx[2] + B[1][0]*kv1[2]], 
  [vy[0] + B[1][0]*kv1[3],  vy[1] + B[1][0]*kv1[4],  vy[2] + B[1][0]*kv1[5]], 
  dt).map(z => z * dt);

let kv2 = dvdt(
  [x[0] + B[1][0]*kx1[0], x[1] + B[1][0]*kx1[1], x[2] + B[1][0]*kx1[2]],
  [y[0] + B[1][0]*kx1[3], y[1] + B[1][0]*kx1[4], y[2] + B[1][0]*kx1[5]], 
  m, dt).map(z => z * dt);

  // step 3
var kx3 = dxdt(
  [vx[0] + B[2][0]*kv1[0] + B[2][1]*kv2[0], 
   vx[1] + B[2][0]*kv1[1] + B[2][1]*kv2[1], 
   vx[2] + B[2][0]*kv1[2] + B[2][1]*kv2[2]],
  [vy[0] + B[2][0]*kv1[3] + B[2][1]*kv2[3],
   vy[1] + B[2][0]*kv1[4] + B[2][1]*kv2[4],
   vy[2] + B[2][0]*kv1[5] + B[2][1]*kv2[5]],
   dt).map(x => x * dt);

var kv3 = dvdt(
  [x[0] + B[2][0]*kx1[0] + B[2][1]*kx2[0], 
   x[1] + B[2][0]*kx1[1] + B[2][1]*kx2[1], 
   x[2] + B[2][0]*kx1[2] + B[2][1]*kx2[2]], 
  [y[0] + B[2][0]*kx1[3] + B[2][1]*kx2[3],
   y[1] + B[2][0]*kx1[4] + B[2][1]*kx2[4],
   y[2] + B[2][0]*kx1[5] + B[2][1]*kx2[5]], 
  m, dt).map(x => x * dt);

// step 4
var kx4 = dxdt(
  [vx[0] + B[3][0]*kv1[0] + B[3][1]*kv2[0] + B[3][2]*kv3[0], 
   vx[1] + B[3][0]*kv1[1] + B[3][1]*kv2[1] + B[3][2]*kv3[1],
   vx[2] + B[3][0]*kv1[2] + B[3][1]*kv2[2] + B[3][2]*kv3[2]], 
  [vy[0] + B[3][0]*kv1[3] + B[3][1]*kv2[3] + B[3][2]*kv3[3],
   vy[1] + B[3][0]*kv1[4] + B[3][1]*kv2[4] + B[3][2]*kv3[4],
   vy[2] + B[3][0]*kv1[5] + B[3][1]*kv2[5] + B[3][2]*kv3[5]],
  dt).map(x => x * dt);

var kv4 = dvdt(
  [x[0] + B[3][0]*kx1[0] + B[3][1]*kx2[0] + B[3][2]*kx3[0], 
   x[1] + B[3][0]*kx1[1] + B[3][1]*kx2[1] + B[3][2]*kx3[1],
   x[2] + B[3][0]*kx1[2] + B[3][1]*kx2[2] + B[3][2]*kx3[2]], 
  [y[0] + B[3][0]*kx1[3] + B[3][1]*kx2[3] + B[3][2]*kx3[3],
   y[1] + B[3][0]*kx1[4] + B[3][1]*kx2[4] + B[3][2]*kx3[4],
   y[2] + B[3][0]*kx1[5] + B[3][1]*kx2[5] + B[3][2]*kx3[5]],
  m, dt).map(x => x * dt);

// step 5  
var kx5 = dxdt(
  [vx[0] + B[4][0]*kv1[0] + B[4][1]*kv2[0] + B[4][2]*kv3[0] + B[4][3]*kv4[0], 
   vx[1] + B[4][0]*kv1[1] + B[4][1]*kv2[1] + B[4][2]*kv3[1] + B[4][3]*kv4[1],
   vx[2] + B[4][0]*kv1[2] + B[4][1]*kv2[2] + B[4][2]*kv3[2] + B[4][3]*kv4[2]], 
  [vy[0] + B[4][0]*kv1[3] + B[4][1]*kv2[3] + B[4][2]*kv3[3] + B[4][3]*kv4[3],
   vy[1] + B[4][0]*kv1[4] + B[4][1]*kv2[4] + B[4][2]*kv3[4] + B[4][3]*kv4[4],
   vy[2] + B[4][0]*kv1[5] + B[4][1]*kv2[5] + B[4][2]*kv3[5] + B[4][3]*kv4[5]],
  dt).map(x => x * dt);

var kv5 = dvdt(
  [x[0] + B[4][0]*kx1[0] + B[4][1]*kx2[0] + B[4][2]*kx3[0] + B[4][3]*kx4[0], 
   x[1] + B[4][0]*kx1[1] + B[4][1]*kx2[1] + B[4][2]*kx3[1] + B[4][3]*kx4[1],
   x[2] + B[4][0]*kx1[2] + B[4][1]*kx2[2] + B[4][2]*kx3[2] + B[4][3]*kx4[2]], 
  [y[0] + B[4][0]*kx1[3] + B[4][1]*kx2[3] + B[4][2]*kx3[3] + B[4][3]*kx4[3],
   y[1] + B[4][0]*kx1[4] + B[4][1]*kx2[4] + B[4][2]*kx3[4] + B[4][3]*kx4[4],
   y[2] + B[4][0]*kx1[5] + B[4][1]*kx2[5] + B[4][2]*kx3[5] + B[4][3]*kx4[5]],
  m, dt).map(x => x * dt);

// step 6 
var kx6 = dxdt(
  [vx[0] + B[5][0]*kv1[0] + B[5][1]*kv2[0] + B[5][2]*kv3[0] + B[5][3]*kv4[0] + B[5][4]*kv5[0], 
   vx[1] + B[5][0]*kv1[1] + B[5][1]*kv2[1] + B[5][2]*kv3[1] + B[5][3]*kv4[1] + B[5][4]*kv5[1],
   vx[2] + B[5][0]*kv1[2] + B[5][1]*kv2[2] + B[5][2]*kv3[2] + B[5][3]*kv4[2] + B[5][4]*kv5[2]], 
  [vy[0] + B[5][0]*kv1[3] + B[5][1]*kv2[3] + B[5][2]*kv3[3] + B[5][3]*kv4[3] + B[5][4]*kv5[3],
   vy[1] + B[5][0]*kv1[4] + B[5][1]*kv2[4] + B[5][2]*kv3[4] + B[5][3]*kv4[4] + B[5][4]*kv5[4],
   vy[2] + B[5][0]*kv1[5] + B[5][1]*kv2[5] + B[5][2]*kv3[5] + B[5][3]*kv4[5] + B[5][4]*kv5[5]],
  dt).map(x => x * dt);

var kv6 = dvdt(
  [x[0] + B[5][0]*kx1[0] + B[5][1]*kx2[0] + B[5][2]*kx3[0] + B[5][3]*kx4[0] + B[5][4]*kx5[0], 
   x[1] + B[5][0]*kx1[1] + B[5][1]*kx2[1] + B[5][2]*kx3[1] + B[5][3]*kx4[1] + B[5][4]*kx5[1],
   x[2] + B[5][0]*kx1[2] + B[5][1]*kx2[2] + B[5][2]*kx3[2] + B[5][3]*kx4[2] + B[5][4]*kx5[2]], 
  [y[0] + B[5][0]*kx1[3] + B[5][1]*kx2[3] + B[5][2]*kx3[3] + B[5][3]*kx4[3] + B[5][4]*kx5[3],
   y[1] + B[5][0]*kx1[4] + B[5][1]*kx2[4] + B[5][2]*kx3[4] + B[5][3]*kx4[4] + B[5][4]*kx5[4],
   y[2] + B[5][0]*kx1[5] + B[5][1]*kx2[5] + B[5][2]*kx3[5] + B[5][3]*kx4[5] + B[5][4]*kx5[5]],
  m, dt).map(x => x * dt);
  
// find the next x, y, vx, vy for each planet 
var xf = [
  x0[0] + (C4[0]*kx1[0] + C4[1]*kx2[0] + C4[2]*kx3[0] + C4[3]*kx4[0] + C4[4]*kx5[0]),
  x0[1] + (C4[0]*kx1[1] + C4[1]*kx2[1] + C4[2]*kx3[1] + C4[3]*kx4[1] + C4[4]*kx5[1]),
  x0[2] + (C4[0]*kx1[2] + C4[1]*kx2[2] + C4[2]*kx3[2] + C4[3]*kx4[2] + C4[4]*kx5[2])
];
var yf = [
  y0[0] + (C4[0]*kx1[3] + C4[1]*kx2[3] + C4[2]*kx3[3] + C4[3]*kx4[3] + C4[4]*kx5[3]),
  y0[1] + (C4[0]*kx1[4] + C4[1]*kx2[4] + C4[2]*kx3[4] + C4[3]*kx4[4] + C4[4]*kx5[4]),
  y0[2] + (C4[0]*kx1[5] + C4[1]*kx2[5] + C4[2]*kx3[5] + C4[3]*kx4[5] + C4[4]*kx5[5])
];

// acceleration components (scaled *dt) 
// to be used in final velocities and to be returned to the planets
let ax1 = (C4[0]*kv1[0] + C4[1]*kv2[0] + C4[2]*kv3[0] + C4[3]*kv4[0] + C4[4]*kv5[0]);
let ax2 = (C4[0]*kv1[1] + C4[1]*kv2[1] + C4[2]*kv3[1] + C4[3]*kv4[1] + C4[4]*kv5[1]);
let ax3 = (C4[0]*kv1[2] + C4[1]*kv2[2] + C4[2]*kv3[2] + C4[3]*kv4[2] + C4[4]*kv5[2]) 
let ay1 = (C4[0]*kv1[3] + C4[1]*kv2[3] + C4[2]*kv3[3] + C4[3]*kv4[3] + C4[4]*kv5[3]) 
let ay2 = (C4[0]*kv1[4] + C4[1]*kv2[4] + C4[2]*kv3[4] + C4[3]*kv4[4] + C4[4]*kv5[4])
let ay3 = (C4[0]*kv1[5] + C4[1]*kv2[5] + C4[2]*kv3[5] + C4[3]*kv4[5] + C4[4]*kv5[5])

var vxf = [vx0[0] + ax1, vx0[1] + ax2, vx0[2] + ax3];
var vyf = [vy0[0] + ay1, vy0[1] + ay2, vy0[2] + ay3];

// Errors 
// This is the difference between y_n+1 - y_n where y_n is the 4rd order
// solution and y_n+1 the 5rd order one 
var TEarray:number[] = [
  // velocities differences
  Math.abs(E[0]*kv1[0] + E[1]*kv2[0] + E[2]*kv3[0] + E[3]*kv4[0] + E[4]*kv5[0] + E[5]*kv6[0]),
  Math.abs(E[0]*kv1[1] + E[1]*kv2[1] + E[2]*kv3[1] + E[3]*kv4[1] + E[4]*kv5[1] + E[5]*kv6[0]),
  Math.abs(E[0]*kv1[2] + E[1]*kv2[2] + E[2]*kv3[2] + E[3]*kv4[2] + E[4]*kv5[2] + E[5]*kv6[2]),
  Math.abs(E[0]*kv1[3] + E[1]*kv2[3] + E[2]*kv3[3] + E[3]*kv4[3] + E[4]*kv5[3] + E[5]*kv6[3]),
  Math.abs(E[0]*kv1[4] + E[1]*kv2[4] + E[2]*kv3[4] + E[3]*kv4[4] + E[4]*kv5[4] + E[5]*kv6[4]),
  Math.abs(E[0]*kv1[5] + E[1]*kv2[5] + E[2]*kv3[5] + E[3]*kv4[5] + E[4]*kv5[5] + E[5]*kv6[5]),
  // positions differences
  Math.abs(E[0]*kx1[0] + E[1]*kx2[0] + E[2]*kx3[0] + E[3]*kx4[0] + E[4]*kx5[0] + E[5]*kx6[0]),
  Math.abs(E[0]*kx1[1] + E[1]*kx2[1] + E[2]*kx3[1] + E[3]*kx4[1] + E[4]*kx5[1] + E[5]*kx6[1]),
  Math.abs(E[0]*kx1[2] + E[1]*kx2[2] + E[2]*kx3[2] + E[3]*kx4[2] + E[4]*kx5[2] + E[5]*kx6[2]),
  Math.abs(E[0]*kx1[3] + E[1]*kx2[3] + E[2]*kx3[3] + E[3]*kx4[3] + E[4]*kx5[3] + E[5]*kx6[3]),
  Math.abs(E[0]*kx1[4] + E[1]*kx2[4] + E[2]*kx3[4] + E[3]*kx4[4] + E[4]*kx5[4] + E[5]*kx6[4]),
  Math.abs(E[0]*kx1[5] + E[1]*kx2[5] + E[2]*kx3[5] + E[3]*kx4[5] + E[4]*kx5[5] + E[5]*kx6[5]),
];  

// TE is the maximum of all errors
var TE = Math.max(...TEarray);

// Calculate the optimum next step

// according to Wikipedia article 
// let dt_new = 0.9*dt*(err/TE)**0.2;
 
// according to "Numerical Methods Using Matlab", 4th Edition, 2004
// John H. Mathews and Kurtis K. Fink
// ISBN: 0-13-065248-2 
let dt_new = 0.84*dt*(err*dt/TE)**0.25;

// return a handfull of numbers...
return [xf[0], xf[1], xf[2], yf[0], yf[1], yf[2], 
        vxf[0], vxf[1], vxf[2], vyf[0], vyf[1], vyf[2],
        TE, dt_new,
        ax1, ax2, ax3, ay1, ay2, ay3
      ];
}

/**
 * Collision between two spheres
 * Borrowed from my program clone of asteroids in javascript 
 * @param p1x x1 coordinate
 * @param p1y y1 coordinate
 * @param r1 radius of first circle
 * @param p2x x2 coordinate
 * @param p2y y2 coordinate
 * @param r2 radius of second circle
 * @returns true if we have collision
 */
function circleCollision(p1x: number, p1y: number, r1: number, p2x: number, p2y: number, r2: number) : boolean {
  let radiusSum;
  let xDiff;
  let yDiff;

  radiusSum = r1 + r2;
  xDiff = p1x - p2x;
  yDiff = p1y - p2y;

  if (radiusSum > Math.sqrt((xDiff * xDiff) + (yDiff * yDiff))) {
      return true;
  } else {
      return false;
  }
}

/**
 * function elasticCollision
 * Borrowed from my program clone of asteroids in javascript 
 * @param x1 x coordinate of first planet
 * @param y1 y coordinate of first planet
 * @param vx1 vx velocity of first planet
 * @param vy1 vy velocity of first planet
 * @param m1 mass of first planet
 * @param x2 x coordinate of second planet
 * @param y2 y coordinate of second planet
 * @param vx2 vx velocity of second planet
 * @param vy2 vx velocity of second planet
 * @param m2 mass of second planet
 * @returns the new velocities vector assuming elastic collision between two objects.
 * Also returns an analog to the collision energy 
 */
function elasticColission(x1: number, y1: number, vx1: number, vy1: number, m1: number, x2: number, y2: number, vx2: number, vy2: number, m2: number) {
  // thet is the angle between the x-axis and the objects centres
  let thet = Math.atan2((y2 - y1), (x2 - x1));
  let cosTheta = Math.cos(thet);
  let sinTheta = Math.sin(thet);
  let v1p, v1k, v2p, v2k;
  let v1pn, v1kn, v2pn, v2kn;
  let v1xn, v2xn, v1yn, v2yn;

  // calculate the velocities parallel (p) and normal (k) to the object centres
  v1p = vx1 * cosTheta + vy1 * sinTheta;
  v2p = vx2 * cosTheta + vy2 * sinTheta;
  v1k = vx1 * sinTheta - vy1 * cosTheta;
  v2k = vx2 * sinTheta - vy2 * cosTheta;

  // calculate the new velocities p and k assuming elastic collision
  v1pn = ((m1 - m2) * v1p + 2 * m2 * v2p) / (m1 + m2);
  v2pn = ((m2 - m1) * v2p + 2 * m1 * v1p) / (m1 + m2);

  // leave the normal velocities unchanged
  v1kn = v1k;
  v2kn = v2k;

  // caclulate the new velocities on x and y-axis
  v1xn = v1kn * sinTheta + v1pn * cosTheta;
  v1yn = - v1kn * cosTheta + v1pn * sinTheta;
  v2xn = v2kn * sinTheta + v2pn * cosTheta;
  v2yn = - v2kn * cosTheta + v2pn * sinTheta;

  // Caclulate the Δp_1 
  // In every collision Δp_1 = - Δp_2
  // (in reality this is the force between the objects)
  let DeltaP = Math.abs(m1 * v1p + m1 * v1pn);

  // return the values
  return [v1xn, v1yn, v2xn, v2yn, DeltaP];
}

function wheelHandler(evt:WheelEvent)  {

  // Scrolling up
  if (evt.deltaY < 0) {
    cordSys.setScale(cordSys.getScale()*1.2);   
  }

  // Scrolling down
  if(evt.deltaY > 0)  {
    cordSys.setScale(cordSys.getScale()*0.8);
  }
}

let x1: number = 1
let y1: number = 1
let x2: number = 1
let y2: number = 1

function dragStart(event: MouseEvent) {
  x1 = event.offsetX;
  y1 = event.offsetY;
}

function dragEnd(event:  MouseEvent) {
  x2 = event.offsetX;
  y2 = event.offsetY;
  cordSys.setX(cordSys.getX()-(x2-x1));
  cordSys.setY(cordSys.getY()-(y2-y1));
}

// Key scan function and handling
function handleKeyPress(event: KeyboardEvent): void {
  if (event.code === "Space") {
    isPaused = !isPaused;
    if (!isPaused) {
      // Call requestAnimationFrame to resume the animation loop
      requestAnimationFrame(animate);
      // for debug perpose...
      // console.log(planet1);
      // console.log(planet2);
      // console.log(planet3);
    }
  }
  if (event.code === "KeyC") {
    hasCollisions = !hasCollisions;
  }
  if (event.code === "KeyA") {
    showAccel = !showAccel;
  }
  if (event.code === "KeyV") {
    showVel = !showVel;
  }
  if (event.code === "KeyT") {
    hasTrails = !hasTrails;
  }
  if (event.code === "KeyZ") {
    cordSys.setScale(cordSys.getScale()*0.8);
  }
  if (event.code === "KeyX") {
    cordSys.setScale(cordSys.getScale()*1.2);
  }
  if (event.code === "ArrowRight") {
    cordSys.setX(cordSys.getX()+50);
  }
  if (event.code === "ArrowLeft") {
    cordSys.setX(cordSys.getX()-50);
  }
  if (event.code === "ArrowUp") {
    cordSys.setY(cordSys.getY()-50);
  }
  if (event.code === "ArrowDown") {
    cordSys.setY(cordSys.getY()+50);
  }
}

// loop with time calculation
let lastFrameTime: number = 0;

// basic animation loop
function animate(currentTime: number): void {
  // Calculate the time elapsed since the last frame
  const timeElapsed: number = currentTime - lastFrameTime;
  lastFrameTime = currentTime;

  // Code to animate something goes here
  // console.log(timeElapsed);
  Render(timeElapsed);

  if (!isPaused) {
    // Call requestAnimationFrame again to continue the animation loop
    requestAnimationFrame(animate);
  }
  // Call requestAnimationFrame again to continue the animation loop
  // requestAnimationFrame(animate);
}

// Listen for keyboard events
document.addEventListener("keydown", handleKeyPress);

// Call the animation function for the first time
requestAnimationFrame((currentTime: number) => {
  // Set the last frame time to the current time
  lastFrameTime = currentTime;
  animate(currentTime);
});