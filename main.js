const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const statsDiv = document.getElementById("stats");
const resetBtn = document.getElementById("resetBtn");
const logPanel = document.getElementById("log-content");
const scoreEl = document.getElementById("ai-score");
const statCrossed = document.getElementById("stat-crossed");
const statCrashed = document.getElementById("stat-crashed");
const statWaited = document.getElementById("stat-waited");
const avgRewardEl = document.getElementById("avg-reward");
const pauseBtn = document.getElementById("pauseBtn");
const simTimer = document.getElementById("sim-timer");
const speedInput = document.getElementById("sim-speed-input");

let isPaused = false;
let simSpeed = 1;
let totalSessionTime = parseInt(localStorage.getItem("TOTAL_SESSION_TIME")) || 5000;
// Starting at 1h 23m 20s (5000s) if no saved time exists


// ---------- VISUAL CONFIG ----------
const ROAD_WIDTH = 100;
const LANE_WIDTH = ROAD_WIDTH / 2;
const CENTER = 200;
const LIGHT_OFFSET = 65; // Stop line distance
const CAR_WIDTH = 12;
const CAR_LENGTH = 20;

// ---------- ENVIRONMENT STATE (Logic) ----------
let env = {};

// Valid traffic phases
const PHASES = {
  NS: ["north", "south"],
  EW: ["east", "west"]
};

// Logic Parameters
const ARRIVAL_PROBABILITY = 0.2; // Base (low) probability
const MAX_PASS = 3; // Increased pass rate due to smaller cars
const MIN_GREEN_TIME = 20; // Seconds

// Visual State
let visualCars = [];
const VISUAL_SPAWN_RATE = 0.008;

// ---------- Q-LEARNING CONFIG ----------
const ACTIONS = ["EXTEND", "SWITCH"];
const EPSILON = 0.1;  // Exploration rate (10% random actions)
const ALPHA = 0.1;    // Learning rate
const GAMMA = 0.9;    // Discount factor (future reward importance)

let Q = {};           // Q-table: state -> { EXTEND: value, SWITCH: value }
let prevState = null; // Track previous state for learning
let prevAction = null;
let prevReward = 0;

// ---------- PENALTY / REWARD CONFIG ----------
const REWARDS = {
  CAR_PASSED: 1,
  CAR_WAITING: -1,
  AMBULANCE_PASSED: 5,
  AMBULANCE_WAITING: -200,
  AMBULANCE_CRASH: -500,
  PHASE_SWITCH: -2
};

// ---------- CLASS: VISUAL CAR ----------
class VisualCar {
  constructor(lane, isAmbulance = false) {
    this.lane = lane;
    this.isAmbulance = isAmbulance;
    // Base speeds multiplied by simSpeed
    this.baseSpeed = isAmbulance ? 4 : (2 + Math.random() * 1.5);
    this.speed = this.baseSpeed * simSpeed;
    this.stopped = false;
    this.color = isAmbulance ? "#ffffff" : `hsl(${Math.random() * 360}, 70%, 50%)`;

    // Set start position and direction based on lane
    // Random offset to simulate 2 lanes (side-by-side packing)
    const laneOffset = (Math.random() - 0.5) * 20;

    // Ambulance spawns closer to the edge for instant visibility
    const startDist = this.isAmbulance ? 30 : 50;
    const endDist = this.isAmbulance ? 430 : 450;

    if (lane === "north") { // Coming from Top, moving Down
      this.x = CENTER - LANE_WIDTH / 2 + laneOffset;
      this.y = -startDist;
      this.dx = 0;
      this.dy = 1;
    } else if (lane === "south") { // Coming from Bottom, moving Up
      this.x = CENTER + LANE_WIDTH / 2 + laneOffset;
      this.y = endDist;
      this.dx = 0;
      this.dy = -1;
    } else if (lane === "east") { // Coming from Right, moving Left
      this.x = endDist;
      this.y = CENTER - LANE_WIDTH / 2 + laneOffset;
      this.dx = -1;
      this.dy = 0;
    } else if (lane === "west") { // Coming from Left, moving Right
      this.x = -startDist;
      this.y = CENTER + LANE_WIDTH / 2 + laneOffset;
      this.dx = 1;
      this.dy = 0;
    }
  }

  update() {
    // 1. Check Traffic Light
    // Defensive check: ensure env.lanes and lane exist
    if (!env.lanes || !env.lanes[this.lane]) {
      return; // Skip update if environment not ready
    }
    const stopLine = this.getStopLine();
    const distToStop = this.getDistTo(stopLine);
    const isRed = !env.lanes[this.lane].green;

    // 2. Check Car in front
    const carInFront = this.getCarInFront();
    const distToCar = carInFront ? this.getDistToCar(carInFront) : Infinity;

    // Logic: Stop if at red light OR too close to car in front
    let targetSpeed = this.speed;

    // Stop at red light
    // Ambulance ignores red lights
    if (!this.isAmbulance && isRed && distToStop > 0 && distToStop < 60) {
      targetSpeed = 0;
    }
    // Already passed stop line? Don't stop for red light.
    if (distToStop <= 0 && isRed) {
      // Keep going
    }

    // Stop behind car
    if (distToCar < 50) {
      targetSpeed = 0;
    }

    // Simple physics
    if (this.stopped) {
      if (targetSpeed > 0) this.stopped = false;
    } else {
      if (targetSpeed === 0) this.stopped = true;
    }

    // Move
    if (!this.stopped) {
      this.speed = this.baseSpeed * simSpeed; // Sync speed with multiplier
      this.x += this.dx * this.speed;
      this.y += this.dy * this.speed;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);

    // Rotate based on direction
    if (this.dx === 1) ctx.rotate(0); // Right
    if (this.dx === -1) ctx.rotate(Math.PI); // Left
    if (this.dy === 1) ctx.rotate(Math.PI / 2); // Down
    if (this.dy === -1) ctx.rotate(-Math.PI / 2); // Up

    // Car Body
    ctx.fillStyle = this.color;
    ctx.shadowBlur = 5;
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.roundRect(-CAR_LENGTH / 2, -CAR_WIDTH / 2, CAR_LENGTH, CAR_WIDTH, 4);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Roof (darker)
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(-CAR_LENGTH / 4, -CAR_WIDTH / 2 + 2, CAR_LENGTH / 2, CAR_WIDTH - 4);

    // Headlights
    ctx.fillStyle = "#ffeb3b";
    ctx.fillRect(CAR_LENGTH / 2 - 2, -CAR_WIDTH / 2 + 2, 2, 6);
    ctx.fillRect(CAR_LENGTH / 2 - 2, CAR_WIDTH / 2 - 8, 2, 6);

    // Brake lights
    ctx.fillStyle = "#f44336";
    ctx.fillRect(-CAR_LENGTH / 2, -CAR_WIDTH / 2 + 2, 2, 6);
    ctx.fillRect(-CAR_LENGTH / 2, CAR_WIDTH / 2 - 8, 2, 6);

    // Ambulance Markings
    if (this.isAmbulance) {
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(-2, -CAR_WIDTH / 2 + 2, 4, CAR_WIDTH - 4); // Cross vertical
      ctx.fillRect(-CAR_LENGTH / 4, -2, CAR_LENGTH / 2, 4);   // Cross horizontal

      // Flashing light (visual only, based on time)
      if (Math.floor(Date.now() / 200) % 2 === 0) {
        ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  // Helpers
  getStopLine() {
    if (this.lane === "north") return { x: this.x, y: CENTER - LIGHT_OFFSET };
    if (this.lane === "south") return { x: this.x, y: CENTER + LIGHT_OFFSET };
    if (this.lane === "east") return { x: CENTER + LIGHT_OFFSET, y: this.y };
    if (this.lane === "west") return { x: CENTER - LIGHT_OFFSET, y: this.y };
  }

  getDistTo(point) {
    if (this.lane === "north") return point.y - this.y;
    if (this.lane === "south") return this.y - point.y;
    if (this.lane === "east") return this.x - point.x;
    if (this.lane === "west") return point.x - this.x;
    return Infinity;
  }

  getCarInFront() {
    // Find closest car in same lane that is 'ahead'
    let closest = null;
    let minDist = Infinity;

    visualCars.forEach(c => {
      if (c === this) return;
      if (c.lane !== this.lane) return;

      const dist = this.getDistToCar(c);
      if (dist > 0 && dist < minDist) {
        minDist = dist;
        closest = c;
      }
    });
    return closest;
  }

  getDistToCar(other) {
    if (this.lane === "north") return other.y - this.y;
    if (this.lane === "south") return this.y - other.y;
    if (this.lane === "east") return this.x - other.x;
    if (this.lane === "west") return other.x - this.x;
    return Infinity;
  }
}

// ---------- RESET ----------
function resetEnv() {
  env = {
    lanes: {
      north: { queue: 0, green: true },
      south: { queue: 0, green: true },
      east: { queue: 0, green: false },
      west: { queue: 0, green: false }
    },
    currentPhase: "NS",
    time: 0,
    totalWait: 0, // Accumulator for total waiting time (queue sum over time)
    timeSinceSwitch: 0, // Track time since last phase change
    visualQueue: { north: 0, south: 0, east: 0, west: 0 }, // Buffer for visual spawns
    pressure: { NS: 0, EW: 0 }, // Computed incoming pressure
    bursts: { north: 0, south: 0, east: 0, west: 0 }, // Remaining burst ticks
    cumulativeReward: 0, // RL Reward tracking
    emergency: { active: false, lane: null, timeRemaining: 0, spawnVisual: false, didWait: false, crashed: false }, // Ambulance state
    emergencyStats: { crossed: 0, crashed: 0, waited: 0 }
  };
  visualCars = []; // Clear cars on reset

  if (logPanel) logPanel.innerHTML = ''; // Clear log
  logAI("Simulation Reset", "normal");

  // Initialize recent arrivals for tracking
  for (let lane in env.lanes) {
    env.lanes[lane].recentArrivals = [];
  }

  // Reset Q-learning state variables
  prevState = null;
  prevAction = null;
  prevReward = 0;

  // Update UI
  updateStats();
}

resetEnv();

// ---------- PHASE CONTROL ----------
// ---------- PHASE CONTROL ----------
function setPhase(phase) {
  if (env.timeSinceSwitch < MIN_GREEN_TIME) {
    return; // Not allowed to switch yet
  }

  if (env.currentPhase === phase) return;

  env.currentPhase = phase;
  env.timeSinceSwitch = 0; // Reset timer

  logAI(`[SWITCH] Switched to ${phase}`, "switch");

  // Reward Penalty for switching (Removed if ambulance is waiting)
  if (!env.emergency || !env.emergency.active) {
    env.cumulativeReward += REWARDS.PHASE_SWITCH;
  }

  for (let lane in env.lanes) {
    env.lanes[lane].green = PHASES[phase].includes(lane);
  }
}

// ---------- LOGIC STEP (1 sec tick) ----------
// ---------- LOGIC STEP (1 sec tick) ----------
function step() {
  // Skip if paused
  if (isPaused) return;

  // --- EMERGENCY SPAWN LOGIC ---
  // Scale probability by /simSpeed because we run multiple steps per second
  if (!env.emergency.active && Math.random() < (0.03 / simSpeed)) {
    const lanes = ["north", "south", "east", "west"];
    env.emergency.active = true;

    env.emergency.lane = lanes[Math.floor(Math.random() * lanes.length)];
    env.emergency.timeRemaining = 5; // Reduced to match visual speed better
    env.emergency.spawnVisual = true; // Trigger visual spawn
    env.emergency.didWait = false;
    env.emergency.crashed = false;
    logAI(`[ALERT] 🚑 Ambulance approaching on ${env.emergency.lane.toUpperCase()}!`, "alert");
  }

  // --- EMERGENCY ACTIVE LOGIC ---
  if (env.emergency.active) {
    const embLane = env.emergency.lane;

    // Check if visual car is gone (sync alert with visual)
    // We skip this check on the very first frame where spawnVisual is true
    const visualExists = visualCars.some(c => c.isAmbulance);
    if (!env.emergency.spawnVisual && !visualExists) {
      // Emergency Ended (Left screen)
      if (!env.emergency.crashed) {
        env.emergencyStats.crossed++;
        if (env.emergency.didWait) env.emergencyStats.waited++;
      }

      env.emergency.active = false;
      env.emergency.lane = null;
      updateStats(); // Force update
      return; // End emergency logic immediately
    }

    const isGreen = env.lanes[embLane].green;

    // Track Waiting
    if (!isGreen) {
      env.emergency.didWait = true;
    }

    // 1. Reward Shaping
    if (isGreen) {
      env.cumulativeReward += REWARDS.AMBULANCE_PASSED; // Good job, letting it through
    } else {
      env.cumulativeReward += REWARDS.AMBULANCE_WAITING; // Bad, blocking emergency! (Increased penalty)

      // 2. Collision Risk Calculation
      // If ambulance is on RED, and the crossing street is GREEN
      // We simulate a risk check. 
      // Note: In a real physics engine we'd check overlapping cars. 
      // Here we use a probabalistic model as requested.

      // Check if crossing traffic exists
      let crossingHasTraffic = false;
      if (embLane === 'north' || embLane === 'south') {
        // Crossing is EW. Check if EW has green (implied by isGreen=false for NS, but let's be safe) and has queue?
        // Actually, if NS is RED, EW is likely GREEN.
        // We check if EW has queue or recent arrivals. 
        if (env.lanes.east.queue > 0 || env.lanes.west.queue > 0) crossingHasTraffic = true;
      } else {
        // Crossing is NS
        if (env.lanes.north.queue > 0 || env.lanes.south.queue > 0) crossingHasTraffic = true;
      }

      if (crossingHasTraffic && Math.random() < 0.3) {
        logAI(`[CRASH] 💥 Ambulance collided!`, "alert"); // Red alert?
        env.cumulativeReward += REWARDS.AMBULANCE_CRASH;

        env.emergencyStats.crashed++;
        env.emergency.crashed = true;

        // End emergency on crash? Or just mark it?
        // Usually crash stops the ambulance.
        env.emergency.active = false;
        env.emergency.lane = null;
        // Access visual cars to remove the ambulance?
        visualCars = visualCars.filter(c => !c.isAmbulance);
        updateStats();
        return;
      }
    }

    // Timeout failsafe (only if stuck for very long, e.g. 60s)
    env.emergency.timeRemaining--;
    if (env.emergency.timeRemaining <= -55) { // Allow 5s initial + 55s extra
      // Force kill if stuck
      env.emergency.active = false;
      env.emergency.lane = null;
      // Cleanup visual if stuck?
      visualCars = visualCars.filter(c => !c.isAmbulance);
      updateStats();
    }
  }

  for (let lane in env.lanes) {
    let arrived = 0;
    // Scale probability by /simSpeed
    let spawnRate = ARRIVAL_PROBABILITY / simSpeed;

    // Burst Logic
    if (env.bursts[lane] > 0) {
      spawnRate = 0.8; // High traffic during burst
      env.bursts[lane]--;
    } else {
      // Chance to start a burst
      if (Math.random() < (0.008 / simSpeed)) {
        env.bursts[lane] = 10 + Math.floor(Math.random() * 10); // 10-20s burst
      }
    }

    if (Math.random() < spawnRate) {
      env.lanes[lane].queue += 1;
      env.visualQueue[lane] += 1; // Queue up a visual car
      arrived = 1;
    }

    // 1. Track Arrivals (Rolling Window)
    env.lanes[lane].recentArrivals.push(arrived);
    if (env.lanes[lane].recentArrivals.length > 5) {
      env.lanes[lane].recentArrivals.shift(); // Keep last 5 seconds
    }
  }

  // 2. Compute Pressure
  env.pressure.NS = sum(env.lanes.north.recentArrivals) + sum(env.lanes.south.recentArrivals);
  env.pressure.EW = sum(env.lanes.east.recentArrivals) + sum(env.lanes.west.recentArrivals);


  for (let lane in env.lanes) {
    if (env.lanes[lane].green) {
      const passed = Math.min(MAX_PASS, env.lanes[lane].queue);
      env.lanes[lane].queue -= passed;

      // Reward Throughput: +1 per car passed
      env.cumulativeReward += (passed * REWARDS.CAR_PASSED);
    }
  }

  qLearningAgent(); // 👈 Q-Learning AI decides here

  // Data Logging: Accumulate current queues into total wait
  const totalQueue = env.lanes.north.queue + env.lanes.south.queue + env.lanes.east.queue + env.lanes.west.queue;
  env.totalWait += totalQueue;

  // Update Reward: -1 per waiting car
  env.cumulativeReward += (totalQueue * REWARDS.CAR_WAITING);

  env.time++;
  totalSessionTime++; // Increment persistent timer
  env.timeSinceSwitch++;
  updateStats();
}



// ---------- Q-LEARNING FUNCTIONS ----------

// Discretize the environment state into a string key
function getState() {
  const diff = env.pressure.NS - env.pressure.EW;
  let pressureDiff = diff > 3 ? "HIGH_NS" : diff < -3 ? "HIGH_EW" : "BALANCED";
  const ambulance = env.emergency.active ? "AMB" : "NONE";
  return `${env.currentPhase}_${pressureDiff}_${ambulance}`;
}

// Initialize Q-values for a new state
function initQ(state) {
  if (!Q[state]) {
    Q[state] = { EXTEND: 0, SWITCH: 0 };
  }
}

// Choose action using epsilon-greedy policy
function chooseAction(state) {
  initQ(state);
  // Exploration: random action
  if (Math.random() < EPSILON) {
    return Math.random() < 0.5 ? "EXTEND" : "SWITCH";
  }
  // Exploitation: best known action
  return Q[state].EXTEND >= Q[state].SWITCH ? "EXTEND" : "SWITCH";
}

// Update Q-value using Bellman equation
function updateQ(pState, action, reward, nState) {
  initQ(pState);
  initQ(nState);
  const bestNext = Math.max(Q[nState].EXTEND, Q[nState].SWITCH);
  Q[pState][action] += ALPHA * (reward + GAMMA * bestNext - Q[pState][action]);
}

// Persistence: Save Q-table to localStorage
function saveQ() {
  try {
    localStorage.setItem("TRAFFIC_Q_TABLE", JSON.stringify(Q));
    localStorage.setItem("TOTAL_SESSION_TIME", totalSessionTime);
  } catch (e) {
    console.warn("Could not save to localStorage:", e);
  }
}

// Persistence: Load Q-table from localStorage
function loadQ() {
  try {
    const data = localStorage.getItem("TRAFFIC_Q_TABLE");
    if (data) {
      Q = JSON.parse(data);
      console.log("Q-table loaded:", Object.keys(Q).length, "states");
    }
  } catch (e) {
    console.warn("Could not load Q-table:", e);
  }
}

// Q-Learning Agent (replaces simpleAIAgent)
function qLearningAgent() {
  // Only make decisions after MIN_GREEN_TIME
  if (env.timeSinceSwitch < MIN_GREEN_TIME) {
    return; // Can't act yet
  }

  const currentState = getState();
  const action = chooseAction(currentState);

  // Calculate immediate reward (change since last step)
  const currentReward = env.cumulativeReward - prevReward;

  // Update Q-table from previous step
  if (prevState !== null && prevAction !== null) {
    updateQ(prevState, prevAction, currentReward, currentState);
  }

  // Execute action
  if (action === "SWITCH") {
    const otherPhase = env.currentPhase === "NS" ? "EW" : "NS";
    setPhase(otherPhase);
    logAI(`[Q-LEARN] Action: SWITCH to ${otherPhase}`, "switch");
  } else {
    // EXTEND: do nothing, keep current phase
    // Log exploration occasionally
    if (Math.random() < 0.1) {
      logAI(`[Q-LEARN] Action: EXTEND ${env.currentPhase}`, "extend");
    }
  }

  // Store state for next update
  prevState = currentState;
  prevAction = action;
  prevReward = env.cumulativeReward;
}

// Throttling for logs to prevent spam
let lastLogTime = 0;
function logAI(msg, type) {
  if (!logPanel) return;

  // Throttle extension logs (only allow every 5s)
  if (type === "extend") {
    if (Date.now() - lastLogTime < 5000) return;
    lastLogTime = Date.now();
  }

  const div = document.createElement("div");
  div.className = "log-entry";
  if (type === "switch") div.classList.add("log-yellow");
  if (type === "extend") div.classList.add("log-green");
  if (type === "alert") div.classList.add("log-red");

  div.innerHTML = `<span class="log-time">[${env.time}s]</span> ${msg}`;
  logPanel.appendChild(div);
  logPanel.scrollTop = logPanel.scrollHeight;
}

function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

// ---------- DRAW HOUSING & LIGHTS ----------
function draw() {
  ctx.fillStyle = "#1e2329";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Roads
  ctx.fillStyle = "#333";
  ctx.fillRect(CENTER - ROAD_WIDTH / 2, 0, ROAD_WIDTH, 400);
  ctx.fillRect(0, CENTER - ROAD_WIDTH / 2, 400, ROAD_WIDTH);

  // Dashed Lines
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 10]);
  ctx.beginPath(); ctx.moveTo(CENTER, 0); ctx.lineTo(CENTER, 400); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, CENTER); ctx.lineTo(400, CENTER); ctx.stroke();
  ctx.setLineDash([]);

  // Intersection
  ctx.fillStyle = "#2a2a2a";
  ctx.fillRect(CENTER - ROAD_WIDTH / 2, CENTER - ROAD_WIDTH / 2, ROAD_WIDTH, ROAD_WIDTH);

  // Visual Cars
  visualCars.forEach(c => c.draw(ctx));

  // Lights (Overlay on top)
  drawLight("north", CENTER, CENTER - LIGHT_OFFSET);
  drawLight("south", CENTER, CENTER + LIGHT_OFFSET);
  drawLight("west", CENTER - LIGHT_OFFSET, CENTER);
  drawLight("east", CENTER + LIGHT_OFFSET, CENTER);
}

function drawLight(lane, x, y) {
  const isGreen = env.lanes[lane].green;
  const queue = env.lanes[lane].queue;
  const color = isGreen ? "#00ff88" : "#ff4444";

  ctx.shadowBlur = 15;
  ctx.shadowColor = color;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Queue Text Badge
  if (queue > 0) {
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x + 12, y - 12, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.font = "bold 10px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(queue, x + 12, y - 12);
  }
}

function updateStats() {
  if (simTimer) {
    simTimer.innerText = formatTime(totalSessionTime);
  }

  statsDiv.innerHTML = `
    <div><b>TIME:</b> ${env.time}s</div>
    <div><b>PHASE:</b> <span style="color: ${env.currentPhase === 'NS' ? '#4CAF50' : '#FFC107'}">${env.currentPhase}</span></div>
    <div><b>PRESSURE:</b> NS:${env.pressure.NS} | EW:${env.pressure.EW}</div>
    <div><b>TOTAL WAIT:</b> ${env.totalWait}</div>
    <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 8px 0;">
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
      <div>N: <b>${env.lanes.north.queue}</b></div>
      <div>S: <b>${env.lanes.south.queue}</b></div>
      <div>E: <b>${env.lanes.east.queue}</b></div>
      <div>W: <b>${env.lanes.west.queue}</b></div>
    </div>
    ${env.emergency.active ? `<div style="margin-top:8px; color:#ff4444; font-weight:bold; animation: blink 1s infinite;">🚑 EMERGENCY: ${env.emergency.lane.toUpperCase()}</div>` : ''}
  `;

  if (scoreEl) {
    scoreEl.innerText = env.cumulativeReward;
    // Color code: Green if > -500, Yellow > -2000, Red otherwise
    if (env.cumulativeReward > -500) scoreEl.style.color = "#4CAF50";
    else if (env.cumulativeReward > -2000) scoreEl.style.color = "#FFC107";
    else scoreEl.style.color = "#FF5252";

  }

  if (statCrossed) statCrossed.innerText = env.emergencyStats ? env.emergencyStats.crossed : 0;
  if (statCrashed) statCrashed.innerText = env.emergencyStats ? env.emergencyStats.crashed : 0;
  if (statWaited) statWaited.innerText = env.emergencyStats ? env.emergencyStats.waited : 0;

  // Calculate and display average reward per second
  if (avgRewardEl && env.time > 0) {
    const avgReward = (env.cumulativeReward / env.time).toFixed(2);
    avgRewardEl.innerText = avgReward;
    // Color code: Green if > 0, Yellow if > -2, Red otherwise
    if (avgReward > 0) avgRewardEl.style.color = "#4CAF50";
    else if (avgReward > -2) avgRewardEl.style.color = "#FFC107";
    else avgRewardEl.style.color = "#FF5252";
  }
}

// ---------- ANIMATION LOOP (60fps) ----------
function animate() {
  // Spawn Visual Cars (Based on backlog)
  const lanes = ["north", "south", "east", "west"];

  // Check for Emergency Spawn
  if (env.emergency && env.emergency.spawnVisual) {
    const lane = env.emergency.lane;
    visualCars.push(new VisualCar(lane, true)); // Spawn Ambulance
    env.emergency.spawnVisual = false;
  }

  lanes.forEach(lane => {
    if (env.visualQueue[lane] > 0) {
      // Try to spawn
      const startX = lane === "east" ? 450 : lane === "west" ? -50 : CENTER + (lane === "south" ? LANE_WIDTH / 2 : -LANE_WIDTH / 2);
      const startY = lane === "north" ? -50 : lane === "south" ? 450 : CENTER + (lane === "west" ? LANE_WIDTH / 2 : -LANE_WIDTH / 2);

      // Check overlap
      let overlap = false;
      for (let c of visualCars) {
        if (Math.hypot(c.x - startX, c.y - startY) < 60) overlap = true;
      }

      if (!overlap) {
        visualCars.push(new VisualCar(lane));
        env.visualQueue[lane]--;
      }
    }
  });

  // Update Cars
  visualCars.forEach(c => c.update());

  // Clean up cars that left screen
  visualCars = visualCars.filter(c =>
    c.x > -100 && c.x < 500 && c.y > -100 && c.y < 500
  );

  draw();
  requestAnimationFrame(animate);
}

// ---------- EVENTS ----------


resetBtn.onclick = resetEnv;

pauseBtn.onclick = function () {
  isPaused = !isPaused;
  if (isPaused) {
    pauseBtn.innerHTML = '<span class="icon">▶</span> Resume';
    pauseBtn.classList.add('paused');
  } else {
    pauseBtn.innerHTML = '<span class="icon">⏸</span> Pause';
    pauseBtn.classList.remove('paused');
  }
};

// ---------- SETTINGS SYNC ----------
function initSettings() {
  const settingsMap = {
    "reward-car-passed": "CAR_PASSED",
    "reward-car-waiting": "CAR_WAITING",
    "reward-amb-passed": "AMBULANCE_PASSED",
    "reward-amb-waiting": "AMBULANCE_WAITING",
    "reward-amb-crash": "AMBULANCE_CRASH",
    "reward-switch": "PHASE_SWITCH"
  };

  for (let id in settingsMap) {
    const el = document.getElementById(id);
    if (el) {
      // Set initial value
      el.value = REWARDS[settingsMap[id]];
      // Listen for changes
      el.oninput = function () {
        REWARDS[settingsMap[id]] = parseFloat(this.value) || 0;
        console.log(`Updated ${settingsMap[id]} to ${REWARDS[settingsMap[id]]}`);
      };
    }
  }
}

if (speedInput) {
  speedInput.oninput = function () {
    simSpeed = Math.max(1, parseFloat(this.value) || 1);
  };
}
}

// Start Loops
initSettings();

// Logic loop runs every 1s, but steps 'simSpeed' times
setInterval(() => {
  if (!isPaused) {
    for (let i = 0; i < simSpeed; i++) {
      step();
    }
  }
}, 1000);

requestAnimationFrame(animate); // Visuals at 60fps

// Load Q-table on startup
loadQ();

// Auto-save Q-table every 10 seconds
// Auto-save Q-table every 10 seconds
setInterval(saveQ, 10000);

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s]
    .map(v => v < 10 ? "0" + v : v)
    .join(":");
}
