export interface Lab {
  slug: string;
  title: string;
  tagline: string;
  tags: string[];
  writeup: string[];
}

export const labs: Lab[] = [
  {
    slug: 'slam-playground',
    title: 'SLAM Playground',
    tagline: 'Mapping an unknown space while tracking your own position inside it',
    tags: ['SLAM', 'occupancy grid', 'ICP', 'sensor fusion'],
    writeup: [
      "SLAM, simultaneous localization and mapping, is the chicken-and-egg problem at the heart of every autonomous robot: to know where you are, you need a map; to build a map, you need to know where you are. The robot never gets ground truth, only noisy sensor readings, and has to fuse them into a single best guess of both at once.",
      "Drive the robot with <kb>W</kb>, <kb>S</kb>, <kb>A</kb>, <kb>D</kb>, or the arrow keys. The left panel is ground truth: what actually exists, which the robot never sees. The right panel is the robot's belief, the map and position it has built purely from its own noisy sensors, shown with an uncertainty circle around its estimated pose.",
      "Worth trying: turn every sensor off and drive a lap to see dead reckoning alone drift away from the truth; raise the LiDAR noise (σ) and watch the mapped walls thicken into fuzz; or drift in a straight line along a wall and watch the fused estimate snap back on track.",
    ],
  },
  {
    slug: 'hybrid-astar-parking',
    title: 'Hybrid A* Parking',
    tagline: 'Planning a full reverse-parking maneuver into a tight bay',
    tags: ['hybrid A*', 'parking', 'Reeds-Shepp'],
    writeup: [
      "Plain A* searches a grid and happily produces paths with instant 90° turns, fine for a game character, useless for a car. Hybrid A* searches over the vehicle's actual reachable states instead of grid cells: at every step it only considers moves the car could really drive, respecting its turning radius and letting it choose forward or reverse gears. The result is a path an actual steering wheel can execute, gear changes included.",
      "Click to drop a goal and drag to aim its heading, or just click one of the marked parking slots, and watch the planner search and then drive the maneuver. Manual mode (WASD) is there for comparison, try parking it yourself first.",
      'Worth trying: turn on "show search" to see the fan of explored states before the final path is chosen, and drop the turn-radius slider to its minimum to force noticeably tighter, more careful maneuvers.',
    ],
  },
];
