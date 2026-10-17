/**
 * Fixed ship and airlock as a deliberately simplified, white vector silhouette.
 * Traced from the unchanged assets/ship.png at alpha >= 128, with a 6 px
 * Douglas-Peucker tolerance; the airlock uses straight measured wall faces.
 * Coordinates are relative to the legacy (1269,70) artwork anchor.
 * Ring winding retains the four transparent engine/cockpit apertures.
 * The exact x=-173..202 door cuts and measured wall-start centers are fixed.
 */
export const SHIP_VECTOR_OUTLINES = Object.freeze([
  Object.freeze([
    Object.freeze({ x: -384, y: -65 }), Object.freeze({ x: -173, y: -65 }), Object.freeze({ x: -173, y: -15 }), Object.freeze({ x: -329, y: -15 }), Object.freeze({ x: -329, y: 543 }),
    Object.freeze({ x: -173, y: 543 }), Object.freeze({ x: -173, y: 666 }), Object.freeze({ x: -440, y: 685 }), Object.freeze({ x: -648, y: 711 }), Object.freeze({ x: -821, y: 751 }),
    Object.freeze({ x: -964, y: 839 }), Object.freeze({ x: -1047, y: 915 }), Object.freeze({ x: -1074, y: 972 }), Object.freeze({ x: -1088, y: 1031 }), Object.freeze({ x: -1088, y: 1152 }),
    Object.freeze({ x: -1074, y: 1211 }), Object.freeze({ x: -1047, y: 1268 }), Object.freeze({ x: -964, y: 1344 }), Object.freeze({ x: -821, y: 1432 }), Object.freeze({ x: -648, y: 1472 }),
    Object.freeze({ x: -440, y: 1498 }), Object.freeze({ x: -211, y: 1513 }), Object.freeze({ x: 205, y: 1522 }), Object.freeze({ x: 405, y: 1513 }), Object.freeze({ x: 682, y: 1480 }),
    Object.freeze({ x: 824, y: 1435 }), Object.freeze({ x: 992, y: 1326 }), Object.freeze({ x: 934, y: 1230 }), Object.freeze({ x: 934, y: 953 }), Object.freeze({ x: 992, y: 857 }),
    Object.freeze({ x: 824, y: 748 }), Object.freeze({ x: 682, y: 703 }), Object.freeze({ x: 405, y: 670 }), Object.freeze({ x: 202, y: 660 }), Object.freeze({ x: 202, y: 543 }),
    Object.freeze({ x: 358, y: 543 }), Object.freeze({ x: 358, y: -15 }), Object.freeze({ x: 202, y: -15 }), Object.freeze({ x: 202, y: -65 }), Object.freeze({ x: 413, y: -65 }),
    Object.freeze({ x: 413, y: 570 }), Object.freeze({ x: 402, y: 595 }), Object.freeze({ x: 217, y: 595 }), Object.freeze({ x: 217, y: 615 }), Object.freeze({ x: 423, y: 625 }),
    Object.freeze({ x: 704, y: 661 }), Object.freeze({ x: 856, y: 712 }), Object.freeze({ x: 1140, y: 900 }), Object.freeze({ x: 1176, y: 935 }), Object.freeze({ x: 1186, y: 1009 }),
    Object.freeze({ x: 1188, y: 1152 }), Object.freeze({ x: 1173, y: 1254 }), Object.freeze({ x: 856, y: 1471 }), Object.freeze({ x: 690, y: 1526 }), Object.freeze({ x: 423, y: 1558 }),
    Object.freeze({ x: 216, y: 1572 }), Object.freeze({ x: -126, y: 1571 }), Object.freeze({ x: -644, y: 1518 }), Object.freeze({ x: -666, y: 1536 }), Object.freeze({ x: -661, y: 1638 }),
    Object.freeze({ x: -483, y: 1638 }), Object.freeze({ x: -463, y: 1655 }), Object.freeze({ x: -464, y: 1679 }), Object.freeze({ x: -535, y: 1846 }), Object.freeze({ x: -603, y: 1859 }),
    Object.freeze({ x: -977, y: 1858 }), Object.freeze({ x: -982, y: 1664 }), Object.freeze({ x: -893, y: 1650 }), Object.freeze({ x: -895, y: 1530 }), Object.freeze({ x: -925, y: 1466 }),
    Object.freeze({ x: -962, y: 1416 }), Object.freeze({ x: -1083, y: 1297 }), Object.freeze({ x: -1235, y: 1297 }), Object.freeze({ x: -1265, y: 1280 }), Object.freeze({ x: -1267, y: 909 }),
    Object.freeze({ x: -1257, y: 894 }), Object.freeze({ x: -1235, y: 886 }), Object.freeze({ x: -1083, y: 886 }), Object.freeze({ x: -998, y: 809 }), Object.freeze({ x: -925, y: 717 }),
    Object.freeze({ x: -894, y: 649 }), Object.freeze({ x: -890, y: 541 }), Object.freeze({ x: -894, y: 532 }), Object.freeze({ x: -981, y: 522 }), Object.freeze({ x: -982, y: 349 }),
    Object.freeze({ x: -974, y: 324 }), Object.freeze({ x: -603, y: 324 }), Object.freeze({ x: -535, y: 337 }), Object.freeze({ x: -464, y: 504 }), Object.freeze({ x: -463, y: 528 }),
    Object.freeze({ x: -483, y: 545 }), Object.freeze({ x: -661, y: 545 }), Object.freeze({ x: -666, y: 647 }), Object.freeze({ x: -644, y: 665 }), Object.freeze({ x: -447, y: 639 }),
    Object.freeze({ x: -188, y: 622 }), Object.freeze({ x: -188, y: 595 }), Object.freeze({ x: -373, y: 595 }), Object.freeze({ x: -384, y: 570 }),
  ]),
  Object.freeze([
    Object.freeze({ x: -618, y: 372 }), Object.freeze({ x: -935, y: 376 }), Object.freeze({ x: -935, y: 486 }), Object.freeze({ x: -863, y: 491 }), Object.freeze({ x: -830, y: 574 }),
    Object.freeze({ x: -850, y: 674 }), Object.freeze({ x: -882, y: 734 }), Object.freeze({ x: -827, y: 704 }), Object.freeze({ x: -703, y: 677 }), Object.freeze({ x: -713, y: 658 }),
    Object.freeze({ x: -713, y: 603 }), Object.freeze({ x: -703, y: 515 }), Object.freeze({ x: -691, y: 500 }), Object.freeze({ x: -518, y: 498 }), Object.freeze({ x: -567, y: 386 }),
  ]),
  Object.freeze([
    Object.freeze({ x: 1008, y: 869 }), Object.freeze({ x: 954, y: 956 }), Object.freeze({ x: 954, y: 1227 }), Object.freeze({ x: 1009, y: 1314 }), Object.freeze({ x: 1133, y: 1228 }),
    Object.freeze({ x: 1141, y: 1028 }), Object.freeze({ x: 1133, y: 955 }),
  ]),
  Object.freeze([
    Object.freeze({ x: -1115, y: 933 }), Object.freeze({ x: -1221, y: 941 }), Object.freeze({ x: -1221, y: 1242 }), Object.freeze({ x: -1107, y: 1249 }), Object.freeze({ x: -1130, y: 1187 }),
    Object.freeze({ x: -1134, y: 1088 }), Object.freeze({ x: -1127, y: 992 }), Object.freeze({ x: -1107, y: 936 }),
  ]),
  Object.freeze([
    Object.freeze({ x: -882, y: 1449 }), Object.freeze({ x: -850, y: 1509 }), Object.freeze({ x: -830, y: 1609 }), Object.freeze({ x: -863, y: 1692 }), Object.freeze({ x: -935, y: 1697 }),
    Object.freeze({ x: -935, y: 1807 }), Object.freeze({ x: -611, y: 1811 }), Object.freeze({ x: -571, y: 1801 }), Object.freeze({ x: -518, y: 1685 }), Object.freeze({ x: -691, y: 1683 }),
    Object.freeze({ x: -703, y: 1668 }), Object.freeze({ x: -713, y: 1580 }), Object.freeze({ x: -713, y: 1525 }), Object.freeze({ x: -703, y: 1506 }), Object.freeze({ x: -827, y: 1479 }),
  ]),
]);

export const SHIP_VECTOR_POINT_COUNT = SHIP_VECTOR_OUTLINES.reduce((sum, ring) => sum + ring.length, 0);

/** Append all rings with their original winding; the caller fills once. */
export function appendShipPath(context) {
  for (const ring of SHIP_VECTOR_OUTLINES) {
    ring.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.closePath();
  }
}
