const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const root=path.resolve(__dirname,'..');
const window={};
const ctx=vm.createContext({window,Date,Math,Number,String,Object,Array,Map,Set,JSON,RegExp,TypeError});
for(const f of ['js/growth-reference-data.js','js/growth-reference-datasets.js','js/growth-engine.js']) vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});
const E=window.PediatricGrowthEngine, R=window.GrowthReferenceData;
// BMI: kg / m², with unit conversion from centimetres.
assert.equal(E.calculateBMI(8,70).value,8/(0.7*0.7));
assert.equal(E.calculateBMI('',70).status,'incomplete');
assert.equal(E.calculateBMI(-1,70).status,'failed_validation');
// LMS core formula, L != 0 and the L -> 0 logarithmic limit.
assert(Math.abs(E.lmsZScore(12,1,10,0.1,{extremeCorrection:false}).zScore-2)<1e-10);
assert(Math.abs(E.lmsZScore(12,0,10,Math.log(1.2)/2,{extremeCorrection:false}).zScore-2)<1e-10);
assert.equal(E.lmsZScore(0,1,10,0.1).status,'failed_validation');
// Official-style extreme correction is finite and marked; it never silently returns zero.
const high=E.lmsZScore(20,0,10,0.1);
assert.equal(high.status,'calculated'); assert.equal(high.extremeCorrectionApplied,true); assert(high.zScore>3);
const low=E.lmsZScore(2,0,10,0.1);
assert.equal(low.status,'calculated'); assert.equal(low.extremeCorrectionApplied,true); assert(low.zScore < -3);
// Measurement-position correction follows WHO's 0.7 cm convention.
assert.equal(E.correctLengthHeight(80,'standing_height',365).valueCm,80.7);
assert.equal(E.correctLengthHeight(80,'recumbent_length',800).valueCm,79.3);
assert.equal(E.correctLengthHeight(80,'standing_height',800,24).valueCm,80);
assert.equal(E.correctLengthHeight(80,'standing_height',730,24).valueCm,80.7);
assert.equal(E.correctLengthHeight(80,'standing_height',731,23).valueCm,80);
assert.equal(E.correctLengthHeight(80,'',365).status,'incomplete');
// Age uses dates; retains exact days and WHO month axis without assuming 30 days/month.
assert.equal(E.getAge('2024-02-29','2024-03-01').ageDays,1);
assert.equal(E.getAge('2024-02-30','2024-03-01').valid,false);
assert.equal(E.getAge('2024-02-02','2024-02-01').reason,'before_birth');
// No extrapolation, and interpolation only inside registered table bounds.
const ds={indexType:'weight_for_age',sex:'female',standardId:'WHO_CGS_2006',datasetVersion:'TEST-FIXTURE-NOT-CLINICAL',rows:[{axis:0,L:0,M:3,S:0.1},{axis:300,L:0,M:5,S:0.2}]};
assert.equal(E.interpolateLMS(ds,-1).status,'out_of_reference_range');
const mid=E.interpolateLMS(ds,150); assert.equal(mid.status,'available'); assert.equal(mid.lms.M,4); assert.equal(mid.interpolated,true);
assert.throws(()=>R.registerDataset({...ds,verified:true,benchmarkStatus:'pending',sourceUrl:'https://example.org/test',license:'test',sha256:'a'.repeat(64),reviewedAt:'2026-01-01'}));
assert.throws(()=>R.registerDataset({...ds,verified:true,benchmarkStatus:'passed',sourceUrl:'https://example.org/test',license:'test',sha256:'a'.repeat(64),reviewedAt:'2026-01-01'}));
// Bundled LMS tables are provenance-gated and selected by standard, index, sex, and measurement mode.
assert.equal(R.datasetCount(),20);
assert.equal(R.datasetStatus('WHO_CGS_2006'),'available');
assert.equal(R.datasetStatus('WHO_GGR_2007'),'available');
assert.equal(R.getDataset('WHO_CGS_2006','weight_for_age','female').rows.length,1827);
assert.equal(R.getDataset('WHO_CGS_2006','weight_for_length_height','female','recumbent_length').rows.length,651);
assert.equal(R.getDataset('WHO_CGS_2006','weight_for_length_height','female','standing_height').rows.length,551);
assert.equal(R.getDataset('WHO_GGR_2007','bmi_for_age_5_19','female').rows.length,170);
const blankPatient={birthDate:'2024-01-01',sexAtBirth:'female'};
const blankExam={examDate:'2024-06-01',weightKg:7,lengthHeightCm:65,measurementType:'recumbent_length',edemaStatus:'absent',headCircumferenceCm:42,midUpperArmCircumferenceCm:12};
const evaluation=E.evaluateExam(blankPatient,blankExam);
for(const key of ['weight_for_age','height_for_age_under5','weight_for_length_height','bmi_for_age_under5','head_circumference_for_age','muac_for_age']) {
 const r=evaluation.results.find(x=>x.indexType===key); assert.equal(r.validityStatus,'valid'); assert(Number.isFinite(r.zScore));
}
// Age bands: under-five indices stop at 60 months; WHO 2007 indices are used from 60 months.
const older=E.evaluateExam({birthDate:'2020-01-01',sexAtBirth:'male'},{examDate:'2025-02-01',weightKg:20,lengthHeightCm:110,measurementType:'standing_height',edemaStatus:'absent'});
assert.equal(older.results.find(x=>x.indexType==='weight_for_age').validityStatus,'not_applicable');
assert.equal(older.results.find(x=>x.indexType==='weight_for_age_5_10').validityStatus,'valid');
assert.equal(older.results.find(x=>x.indexType==='height_for_age_5_19').validityStatus,'valid');
assert.equal(older.results.find(x=>x.indexType==='bmi_for_age_5_19').validityStatus,'valid');
// Missing measurements and invalid sex/ranges fail closed, with no fabricated values.
const missing=E.evaluateExam(blankPatient,{examDate:'2024-06-01',weightKg:null,lengthHeightCm:null,measurementType:''});
assert.equal(missing.bmi.status,'incomplete');
assert(missing.results.every(x=>x.validityStatus==='incomplete'||x.validityStatus==='not_applicable'));
const badSex=E.evaluateExam({birthDate:'2024-01-01',sexAtBirth:'unknown'},blankExam);
assert(badSex.results.every(x=>x.validityStatus==='failed_validation'&&x.zScore===null&&x.category===null));
const outRange=E.evaluateExam(blankPatient,{...blankExam,weightKg:999});
assert(outRange.results.every(x=>x.validityStatus==='failed_validation'&&x.zScore===null));
// Category boundaries are index-specific and exact +1 SD remains in the normal band.
assert.equal(E.classifyZScore('weight_for_age',1).category,'Berat badan normal');
assert.equal(E.classifyZScore('weight_for_age',1.0001).category,'Risiko berat badan lebih');
assert.equal(E.classifyZScore('bmi_for_age_5_19',2).category,'Gizi lebih (overweight)');
assert.equal(E.classifyZScore('bmi_for_age_5_19',2.0001).category,'Obesitas');
assert.equal(E.classifyZScore('head_circumference_for_age',0).status,'clinical_review_required');
assert.equal(E.classifyZScore('height_for_age_5_19',0).status,'clinical_review_required');
const age19={valid:true,ageDays:Math.round(228*30.4375),ageMonths:228,completedMonths:228};
const age19Bmi=E.evaluateIndex('bmi_for_age_5_19',{sexAtBirth:'female'},{weightKg:60,lengthHeightCm:165,measurementType:'standing_height',edemaStatus:'absent'},age19);
assert.equal(age19Bmi.validityStatus,'valid');assert.equal(age19Bmi.zScore!==null,true);assert.equal(age19Bmi.category,null);assert.equal(age19Bmi.interpretationStatus,'clinical_review_required');
// Published WHO Anthro 1.1.0 README example (rounded to its two-decimal output).
const who2006=[
 {sex:'male',days:1001,weight:18,height:120,expected:[2.20,7.31,-2.39,-3.01]},
 {sex:'female',days:1000,weight:15,height:80,expected:[0.95,-3.50,4.13,4.66]},
 {sex:'male',days:1010,weight:10,height:100,expected:[-2.76,1.62,-5.19,-5.61]},
 {sex:'male',days:1000,weight:15,height:100,expected:[0.69,1.70,-0.29,-0.58]}
];
for(const c of who2006){
 const age={valid:true,ageDays:c.days,ageMonths:c.days/30.4375,completedMonths:Math.floor(c.days/30.4375)};
 const patient={sexAtBirth:c.sex},exam={weightKg:c.weight,lengthHeightCm:c.height,measurementType:'standing_height',edemaStatus:'absent'};
 const values=['weight_for_age','height_for_age_under5','weight_for_length_height','bmi_for_age_under5'].map(k=>Number(E.evaluateIndex(k,patient,exam,age).zScore.toFixed(2)));
 assert.deepEqual(values,c.expected);
}
// WHO AnthroPlus 1.1.0 boundary examples for 60.32 and 60.911701 months.
for(const c of [{ageMonths:60.32,weight:18.7,height:113.8,expected:[.21,-.58,.96]},{ageMonths:60.911701,weight:20.5,height:113.6,expected:[.79,.42,.85]}]){
 const age={valid:true,ageDays:Math.round(c.ageMonths*30.4375),ageMonths:c.ageMonths,completedMonths:Math.floor(c.ageMonths)};
 const patient={sexAtBirth:'female'},exam={weightKg:c.weight,lengthHeightCm:c.height,measurementType:'standing_height',edemaStatus:'absent'};
 const values=['weight_for_age_5_10','bmi_for_age_5_19','height_for_age_5_19'].map(k=>Number(E.evaluateIndex(k,patient,exam,age).zScore.toFixed(2)));
 assert.deepEqual(values,c.expected);
}
assert.equal(E.evaluateIndex('weight_for_age_5_10',{sexAtBirth:'male'},{weightKg:20,edemaStatus:'absent'},{valid:true,ageDays:3653,ageMonths:120,completedMonths:120}).validityStatus,'valid');
assert.equal(E.lmsZScore(NaN,0,10,0.1).zScore,null);
console.log('PASS BMI formula, units, missing and invalid inputs');
console.log('PASS LMS formula for nonzero L and near-zero L');
console.log('PASS LMS extreme correction and failure handling');
console.log('PASS WHO 0.7 cm length/height conversion');
console.log('PASS date/age validation and no reference extrapolation');
console.log('PASS index routing, sex/reference selection, missing and out-of-range data');
console.log('PASS index-specific Indonesian category thresholds');
console.log('PASS bundled WHO LMS provenance, index/sex/mode selection, and supported age windows');
console.log('PASS WHO Anthro 1.1.0 published example benchmarks for under-five indices');
console.log('PASS WHO AnthroPlus 1.1.0 boundary benchmarks and school-age weight-for-age');
