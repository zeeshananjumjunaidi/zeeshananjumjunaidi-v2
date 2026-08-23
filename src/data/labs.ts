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
      "Drive the robot with WASD or the arrow keys. The left panel is ground truth: what actually exists, which the robot never sees. The right panel is the robot's belief, the map and position it has built purely from its own noisy sensors, shown with an uncertainty circle around its estimated pose.",
      "Worth trying: turn every sensor off and drive a lap to see dead reckoning alone drift away from the truth; raise the LiDAR noise (σ) and watch the mapped walls thicken into fuzz; or drift in a straight line along a wall and watch the fused estimate snap back on track.",
    ],
  },
];
