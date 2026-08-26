export interface Lab {
  slug: string;
  title: string;
  tagline: string;
  tags: string[];
  writeup: string[];
  /** Collapse the writeup behind a disclosure so a tool with several tabs isn't pushed down the page. */
  collapsibleWriteup?: boolean;
}

export const labs: Lab[] = [
  {
    slug: 'slam-playground',
    title: 'SLAM Playground',
    tagline: 'Mapping an unknown space while tracking your own position inside it',
    tags: ['SLAM', 'occupancy grid', 'ICP', 'sensor fusion'],
    writeup: [
      "SLAM, simultaneous localization and mapping, is the chicken-and-egg problem at the heart of every autonomous robot: to know where you are, you need a map; to build a map, you need to know where you are. The robot never gets ground truth, only noisy sensor readings, and has to fuse them into a single best guess of both at once.",
      "Drive the robot with <kbd>W</kbd>, <kbd>S</kbd>, <kbd>A</kbd>, <kbd>D</kbd>, or the arrow keys. The left panel is ground truth: what actually exists, which the robot never sees. The right panel is the robot's belief, the map and position it has built purely from its own noisy sensors, shown with an uncertainty circle around its estimated pose.",
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
      "Click to drop a goal and drag to aim its heading, or just click one of the marked parking slots, and watch the planner search and then drive the maneuver. Manual mode (<kbd>W</kbd>, <kbd>S</kbd>, <kbd>A</kbd>, <kbd>D</kbd>) is there for comparison, try parking it yourself first.",
      'Worth trying: turn on "show search" to see the fan of explored states before the final path is chosen, and drop the turn-radius slider to its minimum to force noticeably tighter, more careful maneuvers.',
    ],
  },
  {
    slug: 'back-of-the-envelope',
    title: 'Back of the Envelope',
    tagline: 'Capacity math for system design',
    tags: ['capacity planning', 'estimation'],
    collapsibleWriteup: true,
    writeup: [
      "Start from daily active users and requests per user, and everything else, peak load, storage, cache size, server count, cost, falls out as a straightforward calculation. Change one assumption and the numbers move through the rest.",
      "It currently covers traffic, storage, cache, and bandwidth, plus a diagram tool for sketching the architecture itself: drag components onto a canvas, connect them, group and color them, animate the data flow between them. More calculator sections (compute, database, cost, and the rest) get added a couple at a time.",
      "Every number here is an order-of-magnitude estimate. The value is in the ratios and the binding constraint, not the digits, if a result changes your architecture, verify it with a measurement before you build on it.",
      'For background on the technique itself, ByteByteGo has a <a href="https://bytebytego.com/courses/system-design-interview/back-of-the-envelope-estimation" target="_blank" rel="noopener">lesson on back-of-the-envelope estimation</a>.',
    ],
  },
];
