function beatInEighth(beat) { return ((beat - 1) % 8) + 1; }
function eighthNumber(beat) { return Math.floor((beat - 1) / 8) + 1; }
function formatBeat(beat, length) {
  const inEighth = beatInEighth(beat);
  const end = inEighth + length - 1;
  return `${eighthNumber(beat)}-я восьмёрка, ${inEighth}-${end}`;
}
function formatBeatNode(beat, length) {
  const inEighth = beatInEighth(beat);
  const end = inEighth + length - 1;
  return `${eighthNumber(beat)}: ${inEighth}-${end}`;
}
function formatBeatShort(beat, length) {
  const inEighth = beatInEighth(beat);
  const end = inEighth + length - 1;
  return `${inEighth}-${end}`;
}
function isSquareEnd(beat, length) { return (beat + length - 1) % 32 === 0; }
function allowedLengths(beat) {
  const b = beatInEighth(beat);
  if (b === 1 || b === 5) return [4, 2];
  if (b === 3 || b === 7) return [2];
  return [];
}