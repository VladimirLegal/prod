const { normalizePersonInput } = require('./normalize');
const { calculateScore } = require('./score');
const { mapAggregatedResult } = require('./mapper');
const checkMvdPassport = require('./sources/mvdPassport');
const checkStopOperRS = require('./sources/stopOperRS');
const checkFssp = require('./sources/fssp');
const checkEfrsb = require('./sources/efrsb');
const checkRosfin = require('./sources/rosfin');
const checkKad = require('./sources/kad');
const checkRasArbitr = require('./sources/rasArbitr');
const checkFns = require('./sources/fns');
const checkCourtsCommon = require('./sources/courtsCommon');

async function checkPerson(personInput, options = {}) {
  const normalized = normalizePersonInput(personInput);

  const sourceOptions = { enableFallback: options.enableFallback };
  const sources = {
    mvdPassport: await checkMvdPassport(normalized, sourceOptions),
    stopOperRS: await checkStopOperRS(normalized, sourceOptions),
    fssp: await checkFssp(normalized, sourceOptions),
    efrsb: await checkEfrsb(normalized, sourceOptions),
    rosfin: await checkRosfin(normalized, sourceOptions),
    kad: await checkKad(normalized, sourceOptions),
    rasArbitr: await checkRasArbitr(normalized, sourceOptions),
    fns: await checkFns(normalized, sourceOptions),
    courtsCommon: await checkCourtsCommon(normalized, sourceOptions),
  };

  const score = calculateScore(sources);
  const aggregated = mapAggregatedResult(normalized, sources, score);
  const createdAt = new Date().toISOString();

  return {
    ...aggregated,
    createdAt,
  };
}

module.exports = checkPerson;