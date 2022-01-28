importScripts('./constants.js');
importScripts('https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js');

onmessage = (e) => {
  const { initState, availableDices, trapIndex, ratio } = e.data;

  const stateCount = PLAYER_CAMEL.reduce((pre, key) => {
    pre[key] = {
      1: 0,
      2: 0,
      5: 0,
    };
    return pre;
  }, {});

  let totalState = 0;

  const move = (prevState, camel, step) => {
    const nextState = _.cloneDeep(prevState);
    for (let i = 0; i < MAP_LENGTH; i++) {
      if (!nextState[i]) {
        continue;
      }
      const camelIndex = nextState[i].indexOf(camel);
      if (camelIndex >= 0) {
        const deleted = nextState[i].splice(camelIndex);
        let returnMark = false;
        if ([CAMEL.white, CAMEL.black].includes(camel)) {
          if (trapIndex[i - step] === 1) {
            step += 1;
          } else if (trapIndex[i - step] === -1) {
            step -= 1;
            returnMark = true;
          }
          const nextBoxIndex = i - step;
          if (nextState[nextBoxIndex]) {
            if ([CAMEL.white, CAMEL.black].includes(nextState[nextBoxIndex][0])) {
              if (returnMark) {
                nextState[nextBoxIndex] = [
                  camel,
                  nextState[nextBoxIndex][0],
                  ...nextState[nextBoxIndex].slice(1),
                  ...deleted.slice(1),
                ];
              } else {
                nextState[nextBoxIndex] = [
                  nextState[nextBoxIndex][0],
                  camel,
                  ...deleted.slice(1),
                  ...nextState[nextBoxIndex].slice(1),
                ];
              }
            } else {
              nextState[nextBoxIndex].unshift(...deleted);
            }
          } else {
            nextState[nextBoxIndex] = [...deleted];
          }
        } else {
          if (trapIndex[i + step] === 1) {
            step += 1;
          } else if (trapIndex[i + step] === -1) {
            step -= 1;
            returnMark = true;
          }
          const nextBoxIndex = i + step;
          if (nextState[nextBoxIndex]) {
            if (returnMark) {
              const firstPlayerCamelIndex = nextState[nextBoxIndex].findIndex((camel) => PLAYER_CAMEL.includes(camel));
              if (firstPlayerCamelIndex >= 0) {
                nextState[nextBoxIndex] = [
                  ...nextState[nextBoxIndex].slice(0, firstPlayerCamelIndex),
                  ...deleted,
                  ...nextState[nextBoxIndex].slice(firstPlayerCamelIndex),
                ];
              } else {
                nextState[nextBoxIndex] = [...deleted];
              }
            } else {
              nextState[nextBoxIndex].push(...deleted);
            }
          } else {
            nextState[nextBoxIndex] = [...deleted];
          }
        }
        break;
      }
    }
    return nextState;
  };

  if (availableDices.length === 6) {
    const tasks = [];
    for (let i = 0; i < availableDices.length; i++) {
      const dice = availableDices[i];
      const nextRemaningDice = availableDices.slice(0, i).concat(availableDices.slice(i + 1));
      if (dice === DICE.whiteBlack) {
        for (let j = 1; j <= 3; j++) {
          tasks.push({
            initState: move(initState, CAMEL.white, j),
            availableDices: nextRemaningDice,
            trapIndex,
            ratio: 1,
          });
        }
        for (let j = 1; j <= 3; j++) {
          tasks.push({
            initState: move(initState, CAMEL.black, j),
            availableDices: nextRemaningDice,
            trapIndex,
            ratio: 1,
          });
        }
      } else {
        for (let j = 1; j <= 3; j++) {
          tasks.push({
            initState: move(initState, dice, j),
            availableDices: nextRemaningDice,
            trapIndex,
            ratio: 2,
          });
        }
      }
    }
    const workers = [];
    let taskIndex = 0;
    let finishedTaskIndex = 0;
    for (let i = 0; i < Math.min(tasks.length, navigator.hardwareConcurrency); i++) {
      const worker = new Worker('./iterator.js');
      worker.onmessage = (e) => {
        const { stateCount: workerStateCount, totalState: workerTotalState } = e.data;
        Object.keys(stateCount).forEach((key) => {
          stateCount[key][1] += workerStateCount[key][1];
          stateCount[key][2] += workerStateCount[key][2];
          stateCount[key][5] += workerStateCount[key][5];
        });
        totalState += workerTotalState;

        if (taskIndex < tasks.length) {
          worker.postMessage(tasks[taskIndex]);
          taskIndex++;
        } else {
          worker.terminate();
        }

        finishedTaskIndex++;
        if (finishedTaskIndex === tasks.length) {
          postMessage({ stateCount, totalState });
        }
      };
      worker.onerror = (e) => {
        throw e;
      };
      workers.push(worker);
    }
    while (taskIndex < workers.length) {
      workers[taskIndex].postMessage(tasks[taskIndex]);
      taskIndex++;
    }
  } else {
    const iteration = (prevState, remainingDice, ratio) => {
      if (remainingDice.length === 1) {
        // 还剩下一个骰子的时候是最终状态，此时计数并退出迭代
        let rank = 0;
        Object.keys(prevState)
          .sort((a, b) => Number.parseInt(b) - Number.parseInt(a))
          .forEach((key) => {
            const camels = prevState[key];
            for (let i = camels.length - 1; i >= 0; i--) {
              if (rank > 5) {
                return;
              }
              const camel = camels[i];
              if ([CAMEL.white, CAMEL.black].includes(camel)) {
                continue;
              }
              if (rank === 0) {
                stateCount[camel][1] += ratio;
              } else if (rank === 1) {
                stateCount[camel][2] += ratio;
              } else if (rank === 4) {
                stateCount[camel][5] += ratio;
              }
              rank += 1;
            }
          });
        totalState += ratio;
        return;
      }
      for (let i = 0; i < remainingDice.length; i++) {
        const dice = remainingDice[i];
        const nextRemainingDice = remainingDice.slice(0, i).concat(remainingDice.slice(i + 1));
        if (dice === DICE.whiteBlack) {
          for (let j = 1; j <= 3; j++) {
            iteration(move(prevState, CAMEL.white, j), nextRemainingDice, ratio);
          }
          for (let j = 1; j <= 3; j++) {
            iteration(move(prevState, CAMEL.black, j), nextRemainingDice, ratio);
          }
        } else {
          for (let j = 1; j <= 3; j++) {
            iteration(move(prevState, dice, j), nextRemainingDice, ratio);
          }
        }
      }
    };
    iteration(initState, availableDices, ratio);
    postMessage({ stateCount, totalState });
  }
};
