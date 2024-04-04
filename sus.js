// const Sus2Image = require('sus-2-image')
import SusAnalyzer from "@sekai-world/sus-analyzer";
import { promises as fs } from "fs";
import xmlbuilder from "xmlbuilder2";
import { Bezier } from "bezier-js";
import svg2img from "@insomnia-dev/convert-svg-to-png";
import axios from "axios";
import pLimit from "p-limit";
import { program } from "commander";

program.version('1.0.0')
  .argument("[songid]", "Id of song, leave blank for all", "")
  .option("-f, --force", "force update charts", false)
  .action(parseCharts);
program.parseAsync();

async function parseCharts(songid, options, command) {
  const { data: musicDifficulties } = await axios.get(
    "https://raw.githubusercontent.com/Sekai-World/sekai-master-db-diff/master/musicDifficulties.json",
    { responseType: "json" }
  );

  const convertChart = async (music) => {
    try {
      if (options.force) {
        throw new Error("forced");
      }
      await fs.stat(
        `Scores/${String(music.musicId).padStart(4, "0")}/${music.musicDifficulty
        }.svg`
      );
    } catch (error) {
      console.log(
        `converting Scores/${String(music.musicId).padStart(4, "0")}/${music.musicDifficulty
        }.sus into svg and png.`
      );
      const svgString = generateSVG(
        await fs.readFile(
          `Scores/${String(music.musicId).padStart(4, "0")}/${music.musicDifficulty
          }.sus`,
          {
            encoding: "utf8",
          }
        ),
        music
      );
      await fs.writeFile(
        `Scores/${String(music.musicId).padStart(4, "0")}/${music.musicDifficulty
        }.svg`,
        svgString
      );
      await fs.writeFile(
        `Scores/${String(music.musicId).padStart(4, "0")}/${music.musicDifficulty
        }.png`,
        await svg2img.convert(svgString)
      );
      console.log(
        `converted Scores/${String(music.musicId).padStart(4, "0")}/${music.musicDifficulty
        }.sus into svg and png.`
      );
    }
  };

  const limit = pLimit(10);
  if (Number(songid)) {
    Promise.all(
      musicDifficulties.filter(music => music.musicId === Number(songid)).map((music) => limit(() => convertChart(music)))
    );
  } else {
    Promise.all(
      musicDifficulties.map((music) => limit(() => convertChart(music)))
    );
  }
};

function generateSVG(sus, musicInfo) {
  const ticksPerBeat = 480;
  const score = SusAnalyzer.getScore(sus, ticksPerBeat);

  const assetsPath = "https://pjsek.ai/images/song/chart";

  const bpmCounts = score.BPMs
    .sort((a, b) => a.measure - b.measure)
    .reduce(
      (acc, cur) => {
        if (cur.bpm !== acc.lastBPM) {
          if (cur.measure === 0) {
            acc.maxFrequency = cur.measure;
            acc.mostFrequent = cur.bpm;
          }
          else {
            const freq = cur.measure - acc.lastMeasure;
            if (freq > acc.maxFrequency) {
              acc.maxFrequency = freq;
              acc.mostFrequent = acc.lastBPM;
            }
          }
          acc.lastBPM = cur.bpm;
          acc.lastMeasure = cur.measure;
        }
        return acc;
      },
      { mostFrequent: 0, maxFrequency: 0, lastMeasure: 0, lastBPM: 0 }
    );

  const basePixelsPerBeat = (80 / 140) * bpmCounts.mostFrequent; // 80px = 120BPM
  const measureGroupSize = 4;
  const topMargin = Math.ceil(basePixelsPerBeat / 8);
  const bottomMargin = Math.ceil(basePixelsPerBeat / 8);
  const leftMargin = Math.ceil(basePixelsPerBeat / 2.5);
  const rightMargin = Math.ceil(basePixelsPerBeat / 2.5);

  // make measure height a fixed number
  const measureHeights = score.BEATs.map(
    (numberOfBeats, i) => basePixelsPerBeat * numberOfBeats
  );
  // const pixelsPerBeats = score.BPMs.map(
  //   (bpm) => (basePixelsPerBeat / bpm) * bpmCounts.mostFrequent
  // );
  const measureBottoms = measureHeights
    .reverse()
    .slice(0, measureGroupSize)
    .reduce((acc, cur, i) => [...acc, acc[i] + cur], [topMargin])
    .reverse();
  const measureGroupCount = Math.ceil(measureHeights.length / measureGroupSize);
  const svgHeight = measureBottoms[0] + bottomMargin;

  const beatWidthRatio = 1.2; // TODO: scale by defining full width
  const laneWidth = Math.ceil((basePixelsPerBeat * beatWidthRatio) / 12);
  const laneLefts = [...Array(13)].map((_, i) => i * laneWidth + leftMargin);

  const svgWidth =
    (leftMargin + rightMargin + laneWidth * 12) * measureGroupCount +
    rightMargin;

  const svg = xmlbuilder.create().ele("svg", {
    version: "1.1",
    xmlns: "http://www.w3.org/2000/svg",
    width: svgWidth,
    height: svgHeight,
  });
  const defs = svg.ele("defs");
  defs
    .ele("marker", {
      id: "skill",
      viewBox: "0 0 10 10",
      refX: "5",
      refY: "5",
      markerWidth: "6",
      markerHeight: "6",
      orient: "auto-start-reverse",
      fill: "darkcyan",
    })
    .ele("path", { d: "M 0 0 L 10 5 L 0 10 z" });
  defs
    .ele("marker", {
      id: "feverStart",
      viewBox: "0 0 10 10",
      refX: "5",
      refY: "5",
      markerWidth: "6",
      markerHeight: "6",
      orient: "auto-start-reverse",
      fill: "brown",
    })
    .ele("path", { d: "M 0 0 L 10 5 L 0 10 z" });
  defs
    .ele("marker", {
      id: "feverPrepare",
      viewBox: "0 0 10 10",
      refX: "5",
      refY: "5",
      markerWidth: "6",
      markerHeight: "6",
      orient: "auto-start-reverse",
      fill: "fuchsia",
    })
    .ele("path", { d: "M 0 0 L 10 5 L 0 10 z" });

  const backgroundGroup = svg.ele("g", { id: "background" });
  const linesGroup = svg.ele("g", { id: "lines" });
  const laneLinesGroup = linesGroup.ele("g", { id: "laneLines" });
  const measureLinesGroup = linesGroup.ele("g", { id: "measureLines" });
  const beatLinesGroup = linesGroup.ele("g", { id: "beatLines" });
  const measureNumberGroup = linesGroup.ele("g", { id: "measureNumber" });

  // draw base
  for (let count = 0; count < measureGroupCount; count++) {
    backgroundGroup.ele("rect", {
      fill: "#00304030",
      // fill: '#000000FF',
      width: laneWidth * 12,
      height: svgHeight,
      x: leftMargin + (leftMargin + rightMargin + laneWidth * 12) * count,
      y: 0,
    });

    laneLefts
      .filter((_, i) => i % 2 === 0)
      .forEach((x, i, arr) => {
        laneLinesGroup.ele("line", {
          stroke:
            (i === 0) | (i === arr.length - 1) ? "#FFFFFFFF" : "#FFFFFF80",
          "stroke-width": 2,
          x1: x + (leftMargin + rightMargin + laneWidth * 12) * count,
          y1: 0,
          x2: x + (leftMargin + rightMargin + laneWidth * 12) * count,
          y2: svgHeight,
        });
      });
    measureBottoms.forEach((y, i) => {
      measureLinesGroup.ele("line", {
        stroke: "#FFFFFFFF",
        "stroke-width": 2,
        x1: leftMargin + (leftMargin + rightMargin + laneWidth * 12) * count,
        y1: y,
        x2:
          leftMargin +
          laneWidth * 12 +
          (leftMargin + rightMargin + laneWidth * 12) * count,
        y2: y,
      });
      measureNumberGroup.ele("line", {
        stroke: "#000000",
        "stroke-width": 2,
        x1:
          leftMargin / 4 + (leftMargin + rightMargin + laneWidth * 12) * count,
        x2: leftMargin + (leftMargin + rightMargin + laneWidth * 12) * count,
        y1: y,
        y2: y,
      });
      measureNumberGroup
        .ele("text", {
          "font-family": "sans-serif",
          "font-size": `${Math.floor(leftMargin / 2.5)}px`,
          x:
            leftMargin / 4 +
            (leftMargin + rightMargin + laneWidth * 12) * count,
          y: y - laneWidth,
        })
        .txt(String(i + count * measureGroupSize + 1).padStart(3, "0"));
    });
    score.BEATs.forEach((measureBeat, measure) => {
      [...Array(measureBeat)]
        .map((_, i) => i)
        .slice(1)
        .forEach((beat) => {
          const y = measureBottoms[measure] - basePixelsPerBeat * beat;
          beatLinesGroup.ele("line", {
            stroke: "#FFFFFF80",
            "stroke-width": 2,
            x1:
              leftMargin + (leftMargin + rightMargin + laneWidth * 12) * count,
            y1: y,
            x2:
              leftMargin +
              laneWidth * 12 + 4 +
              (leftMargin + rightMargin + laneWidth * 12) * count,
            y2: y,
          });
        });
    });
  }

  score.BPMs.forEach(({ measure, tick, bpm }) => {
    const y =
      measureBottoms[measure % measureGroupSize] -
      (tick / ticksPerBeat) * basePixelsPerBeat;
    const count = Math.floor(measure / measureGroupSize);
    measureNumberGroup
      .ele("text", {
        "font-family": "sans-serif",
        "font-size": `${Math.floor(leftMargin / 2.5)}px`,
        fill: "red",
        x: leftMargin +
          laneWidth * 12 +
          (leftMargin + rightMargin + laneWidth * 12) * count,
        y: y,
      })
      .txt(String(bpm).padStart(3, "0"));
  });

  const curveEaseInRatio = 0.5;
  const curveEaseOutRatio = 0.5;
  const straightEaseInRatio = 0;
  const straightEaseOutRatio = 0;

  const getPositionKey = (note) =>
    `M${note.measure}T${note.tick}L${note.lane}W${note.width}`;
  const drawNote = (group, type, measure, tick, lane, width) => {
    const scale = (laneWidth * 3) / (354 - 48 - 48);
    const count = Math.floor(measure / measureGroupSize);
    const rawMeasure = measure;
    measure = measure % measureGroupSize;
    if (!measure && !!count && !tick) {
      const y =
        measureBottoms[measureGroupSize - 1] -
        4 * basePixelsPerBeat -
        (type === "long" ? 54 : 53) * scale -
        36 * scale;
      const height = 186 * scale;
      const noteSideMargin = Math.ceil(48 * scale);
      const noteEndWidth = Math.ceil(91 * scale);
      group
        .ele("image", {
          href: `${assetsPath}/notes_${type}_left.png`,
          x:
            laneLefts[lane] -
            noteSideMargin +
            (leftMargin + rightMargin + laneWidth * 12) * (count - 1),
          y,
          width: noteEndWidth,
          height,
          preserveAspectRatio: "none",
        })
        .up()
        .ele("image", {
          href: `${assetsPath}/notes_${type}_right.png`,
          x:
            laneLefts[lane] -
            noteSideMargin +
            noteEndWidth +
            laneWidth * (width - 1) +
            (leftMargin + rightMargin + laneWidth * 12) * (count - 1),
          y,
          width: noteEndWidth,
          height,
          preserveAspectRatio: "none",
        });
      if (width > 1) {
        group.ele("image", {
          href: `${assetsPath}/notes_${type}_middle.png`,
          x:
            laneLefts[lane] -
            noteSideMargin +
            noteEndWidth +
            (leftMargin + rightMargin + laneWidth * 12) * (count - 1),
          y,
          width: laneWidth * (width - 1),
          height,
          preserveAspectRatio: "none",
        });
      }
    }
    const y =
      measureBottoms[measure] -
      (tick / ticksPerBeat) * basePixelsPerBeat -
      (type === "long" ? 54 : 53) * scale -
      36 * scale;
    const height = 186 * scale;
    const noteSideMargin = Math.ceil(48 * scale);
    const noteEndWidth = Math.ceil(91 * scale);
    group
      .ele("image", {
        href: `${assetsPath}/notes_${type}_left.png`,
        x:
          laneLefts[lane] -
          noteSideMargin +
          (leftMargin + rightMargin + laneWidth * 12) * count,
        y,
        width: noteEndWidth,
        height,
        preserveAspectRatio: "none",
      })
      .up()
      .ele("image", {
        href: `${assetsPath}/notes_${type}_right.png`,
        x:
          laneLefts[lane] -
          noteSideMargin +
          noteEndWidth +
          laneWidth * (width - 1) +
          (leftMargin + rightMargin + laneWidth * 12) * count,
        y,
        width: noteEndWidth,
        height,
        preserveAspectRatio: "none",
      });
    if (width > 1) {
      group.ele("image", {
        href: `${assetsPath}/notes_${type}_middle.png`,
        x:
          laneLefts[lane] -
          noteSideMargin +
          noteEndWidth +
          (leftMargin + rightMargin + laneWidth * 12) * count,
        y,
        width: laneWidth * (width - 1),
        height,
        preserveAspectRatio: "none",
      });
    }
  };
  const flickArrowSizes = {
    straight: [
      {
        width: 144,
        height: 158,
      },
      {
        width: 188,
        height: 174,
      },
      {
        width: 248,
        height: 194,
      },
      {
        width: 312,
        height: 216,
      },
      {
        width: 374,
        height: 236,
      },
      {
        width: 436,
        height: 258,
      },
    ],
    diagonal: [
      {
        width: 176,
        height: 160,
      },
      {
        width: 228,
        height: 182,
      },
      {
        width: 298,
        height: 212,
      },
      {
        width: 376,
        height: 242,
      },
      {
        width: 444,
        height: 270,
      },
      {
        width: 514,
        height: 300,
      },
    ],
  };
  const drawFlickArrow = (
    group,
    measure,
    tick,
    lane,
    width,
    left = false,
    right = false,
    critical = false
  ) => {
    const arrowLaneWidth = width > 6 ? 6 : width;
    const arrowWidth = laneWidth * arrowLaneWidth;
    const href = `${assetsPath}/notes_flick_arrow${critical ? "_crtcl" : ""}_${(
      "" + arrowLaneWidth
    ).padStart(2, "0")}${right || left ? "_diagonal_" : ""}${left ? "left" : right ? "right" : ""
      }.png`;
    const flickArrowSize =
      right || left
        ? flickArrowSizes.diagonal[arrowLaneWidth - 1]
        : flickArrowSizes.straight[arrowLaneWidth - 1];
    const scale = arrowWidth / flickArrowSize.width;
    const count = Math.floor(measure / measureGroupSize);
    const rawMeasure = measure;
    measure = measure % measureGroupSize;
    if (!measure && !!count && !tick) {
      group.ele("image", {
        href,
        x:
          laneLefts[lane] +
          (width / 2) * laneWidth -
          arrowWidth / 2 +
          (left ? -laneWidth / 4 : right ? laneWidth / 4 : 0) +
          (leftMargin + rightMargin + laneWidth * 12) * (count - 1),
        y:
          measureBottoms[measureGroupSize - 1] -
          4 * basePixelsPerBeat -
          flickArrowSize.height * scale -
          basePixelsPerBeat / 32,
        width: arrowWidth,
      });
    }
    group.ele("image", {
      href,
      x:
        laneLefts[lane] +
        (width / 2) * laneWidth -
        arrowWidth / 2 +
        (left ? -laneWidth / 4 : right ? laneWidth / 4 : 0) +
        (leftMargin + rightMargin + laneWidth * 12) * count,
      y:
        measureBottoms[measure] -
        (tick / ticksPerBeat) * basePixelsPerBeat -
        flickArrowSize.height * scale -
        basePixelsPerBeat / 32,
      width: arrowWidth,
    });
  };
  const drawSlidePath = (
    group,
    fromMeasure,
    fromTick,
    fromLane,
    fromWidth,
    toMeasure,
    toTick,
    toLane,
    toWidth,
    easeIn,
    easeOut,
    critical = false
  ) => {
    const shrinkWidth = laneWidth / 16;
    const fromCount = Math.floor(fromMeasure / measureGroupSize);
    const toCount = Math.floor(toMeasure / measureGroupSize);

    for (let count = fromCount; count <= toCount; count++) {
      const fromLeftX =
        Math.ceil(laneLefts[fromLane] + shrinkWidth) +
        (leftMargin + rightMargin + laneWidth * 12) * count;
      const fromRightX =
        Math.floor(laneLefts[fromLane] + laneWidth * fromWidth - shrinkWidth) +
        (leftMargin + rightMargin + laneWidth * 12) * count;
      const rawFromMeasure = fromMeasure;
      fromMeasure = fromMeasure % measureGroupSize;
      const fromY = Math.floor(
        measureBottoms[fromMeasure] +
        (count - fromCount) * measureGroupSize * measureHeights[0] -
        (fromTick / ticksPerBeat) * basePixelsPerBeat
      );
      const toLeftX =
        Math.ceil(laneLefts[toLane] + shrinkWidth) +
        (leftMargin + rightMargin + laneWidth * 12) * count;
      const toRightX =
        Math.floor(laneLefts[toLane] + laneWidth * toWidth - shrinkWidth) +
        (leftMargin + rightMargin + laneWidth * 12) * count;
      const rawToMeasure = toMeasure;
      toMeasure = toMeasure % measureGroupSize;
      const toY = Math.floor(
        measureBottoms[toMeasure] +
        (count - toCount) * measureGroupSize * measureHeights[0] -
        (toTick / ticksPerBeat) * basePixelsPerBeat
      );
      const easeInRatio = easeIn
        ? curveEaseInRatio
        : easeIn
          ? 0
          : straightEaseInRatio;
      const easeOutRatio = easeOut
        ? curveEaseOutRatio
        : easeIn
          ? 0
          : straightEaseOutRatio;

      const d = `M${fromLeftX},${fromY}C${fromLeftX},${fromY - (fromY - toY) * easeInRatio
        },${toLeftX},${toY + (fromY - toY) * easeOutRatio
        },${toLeftX},${toY}H${toRightX}C${toRightX},${toY + (fromY - toY) * easeOutRatio
        },${fromRightX},${fromY - (fromY - toY) * easeInRatio
        },${fromRightX},${fromY}z`;

      group.ele("path", {
        // stroke: '#FFFFFFF0',
        // 'stroke-width': 2,
        fill: critical ? "#FFFCCCF0" : "#DAFDF0F0",
        d,
      });
    }
  };
  const drawWaypointDiamond = (
    group,
    measure,
    tick,
    lane,
    width,
    critical = false
  ) => {
    const diamondWidth = laneWidth * 1.5;
    const count = Math.floor(measure / measureGroupSize);
    const rawMeasure = measure;
    measure = measure % measureGroupSize;
    if (!measure && !!count && !tick) {
      group.ele("image", {
        href: `${assetsPath}/notes_long_among${critical ? "_crtcl" : ""}.png`,
        x:
          laneLefts[lane] +
          (laneWidth * width) / 2 -
          diamondWidth / 2 +
          (leftMargin + rightMargin + laneWidth * 12) * (count - 1),
        y:
          measureBottoms[measureGroupSize - 1] -
          4 * basePixelsPerBeat -
          diamondWidth / 2,
        width: diamondWidth,
      });
    }
    group.ele("image", {
      href: `${assetsPath}/notes_long_among${critical ? "_crtcl" : ""}.png`,
      x:
        laneLefts[lane] +
        (laneWidth * width) / 2 -
        diamondWidth / 2 +
        (leftMargin + rightMargin + laneWidth * 12) * count,
      y:
        measureBottoms[measure] -
        (tick / ticksPerBeat) * basePixelsPerBeat -
        diamondWidth / 2,
      width: diamondWidth,
    });
  };
  const drawInterpolatedDiamond = (
    group,
    measure,
    tick,
    fromMeasure,
    fromTick,
    fromLane,
    fromWidth,
    toMeasure,
    toTick,
    toLane,
    toWidth,
    easeIn,
    easeOut,
    critical = false
  ) => {
    const diamondWidth = laneWidth * 1.5;
    const shrinkWidth = laneWidth / 16;
    const fromCount = Math.floor(fromMeasure / measureGroupSize);
    const toCount = Math.floor(toMeasure / measureGroupSize);
    const pointCount = Math.floor(measure / measureGroupSize);

    for (let count = fromCount; count <= toCount; count++) {
      if (count !== pointCount) continue;
      const fromLeftX =
        Math.ceil(laneLefts[fromLane] + shrinkWidth) +
        (leftMargin + rightMargin + laneWidth * 12) * count;
      const fromRightX =
        Math.floor(laneLefts[fromLane] + laneWidth * fromWidth - shrinkWidth) +
        (leftMargin + rightMargin + laneWidth * 12) * count;
      const rawFromMeasure = fromMeasure;
      fromMeasure = fromMeasure % measureGroupSize;
      const fromY = Math.floor(
        measureBottoms[fromMeasure] +
        (count - fromCount) * measureGroupSize * measureHeights[0] -
        (fromTick / ticksPerBeat) * basePixelsPerBeat
      );
      const toLeftX =
        Math.ceil(laneLefts[toLane] + shrinkWidth) +
        (leftMargin + rightMargin + laneWidth * 12) * count;
      const toRightX =
        Math.floor(laneLefts[toLane] + laneWidth * toWidth - shrinkWidth) +
        (leftMargin + rightMargin + laneWidth * 12) * count;
      const rawToMeasure = toMeasure;
      toMeasure = toMeasure % measureGroupSize;
      const toY = Math.floor(
        measureBottoms[toMeasure] +
        (count - toCount) * measureGroupSize * measureHeights[0] -
        (toTick / ticksPerBeat) * basePixelsPerBeat
      );
      const easeInRatio = easeIn
        ? curveEaseInRatio
        : easeIn
          ? 0
          : straightEaseInRatio;
      const easeOutRatio = easeOut
        ? curveEaseOutRatio
        : easeIn
          ? 0
          : straightEaseOutRatio;
      const rawMeasure = measure;
      measure = measure % measureGroupSize;
      const y =
        measureBottoms[measure] - (tick / ticksPerBeat) * basePixelsPerBeat;
      let leftX, rightX;

      const leftBezier = new Bezier(
        fromLeftX,
        fromY,
        fromLeftX,
        fromY - (fromY - toY) * easeInRatio,
        toLeftX,
        toY + (fromY - toY) * easeOutRatio,
        toLeftX,
        toY
      );
      const rightBezier = new Bezier(
        fromRightX,
        fromY,
        fromRightX,
        fromY - (fromY - toY) * easeInRatio,
        toRightX,
        toY + (fromY - toY) * easeOutRatio,
        toRightX,
        toY
      );

      leftX = Math.ceil(
        leftBezier.get(
          leftBezier.intersects({
            p1: { x: 0, y: y },
            p2: { x: svgWidth, y: y },
          })[0]
        ).x
      );
      rightX = Math.floor(
        rightBezier.get(
          rightBezier.intersects({
            p1: { x: 0, y: y },
            p2: { x: svgWidth, y: y },
          })[0]
        ).x
      );

      group.ele("image", {
        href: `${assetsPath}/notes_long_among${critical ? "_crtcl" : ""}.png`,
        x: (leftX + rightX) / 2 - diamondWidth / 2,
        y: y - diamondWidth / 2,
        width: diamondWidth,
      });
    }
  };
  const drawSkillEvent = (group, type, measure, tick) => {
    const count = Math.floor(measure / measureGroupSize);
    const rawMeasure = measure;
    measure = measure % measureGroupSize;
    // if (!measure && !!count && !tick) {
    //   const y = measureBottoms[measureGroupSize - 1] - 4 * pixelsPerBeat;
    //   group.ele("line", {
    //     "stroke-width": 5,
    //     x1:
    //       leftMargin +
    //       laneWidth * 12 +
    //       10 +
    //       (leftMargin + rightMargin + laneWidth * 12) * (count - 1),
    //     y1: y,
    //     x2:
    //       leftMargin +
    //       laneWidth * 12 +
    //       10 +
    //       (leftMargin + rightMargin + laneWidth * 12) * (count - 1),
    //     y2: y,
    //     "marker-start": `url(#${type})`,
    //   });
    // }
    const y =
      measureBottoms[measure] - (tick / ticksPerBeat) * basePixelsPerBeat;
    group
      .ele("line", {
        "stroke-width": 5,
        x1:
          leftMargin +
          laneWidth * 12 +
          10 +
          (leftMargin + rightMargin + laneWidth * 12) * count,
        y1: y,
        x2:
          leftMargin +
          laneWidth * 12 +
          10 +
          (leftMargin + rightMargin + laneWidth * 12) * count,
        y2: y,
        "marker-start": `url(#${type})`,
      });
    // .up()
    // .ele("text", {
    //   "font-family": "sans-serif",
    //   "font-size": `${Math.floor(leftMargin / 2)}px`,
    //   x:
    //     leftMargin +
    //     laneWidth * 12 +
    //     12 +
    //     (leftMargin + rightMargin + laneWidth * 12) * count,
    //   y: y - Math.floor(leftMargin / 3) * Math.ceil(type.length),
    //   style: "writing-mode: tb;",
    // })
    // .txt(type);
  };

  const drawFeverEvent = (group, type, measure, tick) => {
    const count = Math.floor(measure / measureGroupSize);
    const rawMeasure = measure;
    measure = measure % measureGroupSize;
    // if (!measure && !!count && !tick) {
    //   const y = measureBottoms[measureGroupSize - 1] - 4 * pixelsPerBeat;
    //   group.ele("line", {
    //     "stroke-width": 5,
    //     x1:
    //       leftMargin +
    //       laneWidth * 12 +
    //       10 +
    //       (leftMargin + rightMargin + laneWidth * 12) * (count - 1),
    //     y1: y,
    //     x2:
    //       leftMargin +
    //       laneWidth * 12 +
    //       10 +
    //       (leftMargin + rightMargin + laneWidth * 12) * (count - 1),
    //     y2: y,
    //     "marker-start": `url(#${type})`,
    //   });
    // }
    const y =
      measureBottoms[measure] - (tick / ticksPerBeat) * basePixelsPerBeat;
    group
      .ele("line", {
        "stroke-width": 5,
        x1:
          leftMargin +
          laneWidth * 12 +
          10 +
          (leftMargin + rightMargin + laneWidth * 12) * count,
        y1: y,
        x2:
          leftMargin +
          laneWidth * 12 +
          10 +
          (leftMargin + rightMargin + laneWidth * 12) * count,
        y2: y,
        "marker-start": `url(#${type})`,
      });
    // .up()
    // .ele("text", {
    //   "font-family": "sans-serif",
    //   "font-size": `${Math.floor(leftMargin / 2)}px`,
    //   x:
    //     leftMargin +
    //     laneWidth * 12 +
    //     12 +
    //     (leftMargin + rightMargin + laneWidth * 12) * count,
    //   y: y - Math.floor(leftMargin / 3) * Math.ceil(type.length),
    //   style: "writing-mode: tb;",
    // })
    // .txt(type);
  };

  const taps = {};
  const criticals = {};
  const flickModifiers = {};

  const slideStarts = {};
  const slideEnds = {};
  const slideDiamonds = {};
  const slideWaypoints = {};
  const slideWaypointRemovers = {};
  const slideEaseInModifiers = {};
  const slideEaseOutModifiers = {};

  score.slideNotes.forEach((slideNote) => {
    slideNote.forEach((note) => {
      const key = getPositionKey(note);
      switch (note.noteType) {
        case 1:
          slideStarts[key] = [...(slideStarts[key] || []), note];
          break;
        case 2:
          slideEnds[key] = [...(slideEnds[key] || []), note];
          break;
        case 3:
          slideDiamonds[key] = [...(slideDiamonds[key] || []), note];
          break;
        case 5:
          slideWaypoints[key] = [...(slideWaypoints[key] || []), note];
          break;
        default:
      }
    });
  });
  score.airNotes.forEach((note) => {
    const key = getPositionKey(note);
    switch (note.noteType) {
      case 1:
      case 3:
      case 4:
        flickModifiers[key] = [...(flickModifiers[key] || []), note];
        break;
      case 2:
        slideEaseInModifiers[key] = [
          ...(slideEaseInModifiers[key] || []),
          note,
        ];
        break;
      case 5:
      case 6:
        slideEaseOutModifiers[key] = [
          ...(slideEaseOutModifiers[key] || []),
          note,
        ];
        break;
      default:
    }
  });
  score.shortNotes.forEach((note) => {
    const key = getPositionKey(note);
    switch (note.noteType) {
      case 1:
        taps[key] = [...(taps[key] || []), note];
        break;
      case 2:
        criticals[key] = [...(criticals[key] || []), note];
        break;
      case 3:
        slideWaypointRemovers[key] = [
          ...(slideWaypointRemovers[key] || []),
          note,
        ];
        break;
      default:
    }
  });

  const slidePathsGroup = svg.ele("g", { id: "slidePaths" });
  const slideDiamondsGroup = svg.ele("g", { id: "slideDiamonds" });
  const notesGroup = svg.ele("g", { id: "notes" });
  const criticalNotesGroup = svg.ele("g", { id: "criticalNotes" });
  const arrowsGroup = svg.ele("g", { id: "arrows" });
  const eventsGroup = svg.ele("g", { id: "specialEvents" });

  score.shortNotes
    .filter((note) => note.lane > 1 && note.lane < 14)
    .sort((a, b) => a.measure - b.measure)
    .forEach((note) => {
      const key = getPositionKey(note);
      switch (note.noteType) {
        case 1:
          if (key in flickModifiers) {
            drawNote(
              notesGroup,
              "flick",
              note.measure,
              note.tick,
              note.lane - 2,
              note.width
            );
            drawFlickArrow(
              arrowsGroup,
              note.measure,
              note.tick,
              note.lane - 2,
              note.width,
              flickModifiers[key].some((note) => note.noteType === 3),
              flickModifiers[key].some((note) => note.noteType === 4)
            );
          } else if (
            !(key in slideEaseInModifiers) &&
            !(key in slideEaseOutModifiers)
          ) {
            drawNote(
              notesGroup,
              "normal",
              note.measure,
              note.tick,
              note.lane - 2,
              note.width
            );
          }
          break;
        case 2:
          if (!(key in slideStarts)) {
            drawNote(
              criticalNotesGroup,
              "crtcl",
              note.measure,
              note.tick,
              note.lane - 2,
              note.width
            );
            if (key in flickModifiers) {
              drawFlickArrow(
                arrowsGroup,
                note.measure,
                note.tick,
                note.lane - 2,
                note.width,
                flickModifiers[key].some((note) => note.noteType === 3),
                flickModifiers[key].some((note) => note.noteType === 4),
                true
              );
            }
          }
          break;
        default:
      }
    });
  score.slideNotes.forEach((slideNote) => {
    const pathGroup = slidePathsGroup.ele("g");
    const diamondGroup = slideDiamondsGroup.ele("g");
    const start = slideNote.find((note) => note.noteType === 1);
    const startKey = getPositionKey(start);

    let paths = slideNote.reduce((acc, cur, i, arr) => {
      const key = getPositionKey(cur);
      if (key in slideWaypointRemovers) {
        if (acc.length > 0) {
          acc[acc.length - 1].pathless = [...acc[acc.length - 1].pathless, cur];
        }
        return acc;
      } else {
        if (acc.length > 0) {
          acc[acc.length - 1].end = cur;
        }
        if (i === arr.length - 1) {
          return acc;
        }
        const key = getPositionKey(cur);
        return [
          ...acc,
          {
            start: cur,
            easeIn: key in slideEaseInModifiers,
            easeOut: key in slideEaseOutModifiers,
            pathless: [],
          },
        ];
      }
    }, []);
    paths.forEach((path) => {
      drawSlidePath(
        pathGroup,
        path.start.measure,
        path.start.tick,
        path.start.lane - 2,
        path.start.width,
        path.end.measure,
        path.end.tick,
        path.end.lane - 2,
        path.end.width,
        path.easeIn,
        path.easeOut,
        startKey in criticals
      );
      if (path.start.noteType === 3) {
        drawWaypointDiamond(
          diamondGroup,
          path.start.measure,
          path.start.tick,
          path.start.lane - 2,
          path.start.width,
          startKey in criticals
        );
      }
      path.pathless.forEach((pathless) => {
        drawInterpolatedDiamond(
          diamondGroup,
          pathless.measure,
          pathless.tick,
          path.start.measure,
          path.start.tick,
          path.start.lane - 2,
          path.start.width,
          path.end.measure,
          path.end.tick,
          path.end.lane - 2,
          path.end.width,
          path.easeIn,
          path.easeOut,
          startKey in criticals
        );
      });
    });

    slideNote.forEach((note) => {
      const key = getPositionKey(note);
      switch (note.noteType) {
        case 1:
        case 2:
          if (startKey in criticals || key in criticals) {
            drawNote(
              criticalNotesGroup,
              "crtcl",
              note.measure,
              note.tick,
              note.lane - 2,
              note.width
            );
            if (key in flickModifiers) {
              drawFlickArrow(
                arrowsGroup,
                note.measure,
                note.tick,
                note.lane - 2,
                note.width,
                flickModifiers[key].some((note) => note.noteType === 3),
                flickModifiers[key].some((note) => note.noteType === 4),
                true
              );
            }
          } else if (key in flickModifiers) {
            drawNote(
              notesGroup,
              "flick",
              note.measure,
              note.tick,
              note.lane - 2,
              note.width
            );
            drawFlickArrow(
              arrowsGroup,
              note.measure,
              note.tick,
              note.lane - 2,
              note.width,
              flickModifiers[key].some((note) => note.noteType === 3),
              flickModifiers[key].some((note) => note.noteType === 4)
            );
          } else {
            drawNote(
              notesGroup,
              "long",
              note.measure,
              note.tick,
              note.lane - 2,
              note.width
            );
          }
          break;
        default:
      }
    });
  });

  // skill events
  score.shortNotes
    .filter((note) => note.lane === 0 && note.noteType === 4)
    .forEach((note) => {
      drawSkillEvent(eventsGroup, "skill", note.measure, note.tick);
    });

  // fever events
  score.shortNotes
    .filter((note) => note.lane === 15)
    .forEach((note) => {
      drawFeverEvent(
        eventsGroup,
        note.noteType === 1 ? "feverPrepare" : "feverStart",
        note.measure,
        note.tick
      );
    });

  const svgString = svg.end({ prettyPrint: true });
  return svgString;
}
