const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const root=path.resolve(__dirname,'..');
const window={};
const ctx=vm.createContext({window,Date,Math,Number,String,Object,Array,Map,Set,JSON,RegExp,TypeError});
for(const f of ['js/growth-reference-data.js','js/growth-engine.js']) vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx,{filename:f});
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
assert.equal(E.correctLengthHeight(80,'standing_height',730,24).valueCm,80);
assert.equal(E.correctLengthHeight(80,'standing_height',730,23).valueCm,80.7);
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
// No official data are registered; selection by sex/standard must not fall back to a fabricated or other-sex curve.
assert.equal(R.getDataset('WHO_CGS_2006','weight_for_age','female'),null);
assert.equal(R.getDataset('WHO_CGS_2006','weight_for_age','male'),null);
assert.equal(R.getDataset('WHO_GGR_2007','bmi_for_age_5_19','female'),null);
const blankPatient={birthDate:'2024-01-01',sexAtBirth:'female'};
const blankExam={examDate:'2024-06-01',weightKg:7,lengthHeightCm:65,measurementType:'recumbent_length',headCircumferenceCm:42,midUpperArmCircumferenceCm:12};
const evaluation=E.evaluateExam(blankPatient,blankExam);
for(const key of ['weight_for_age','height_for_age_under5','weight_for_length_height','bmi_for_age_under5','head_circumference_for_age','muac_for_age']) {
 const r=evaluation.results.find(x=>x.indexType===key); assert.equal(r.validityStatus,'not_calculated'); assert.equal(r.zScore,null); assert.equal(r.category,null);
}
// Age bands: under-five indices are not applied to 61-month children; 5-19 indices are routed there.
const older=E.evaluateExam({birthDate:'2020-01-01',sexAtBirth:'male'},{examDate:'2025-02-01',weightKg:20,lengthHeightCm:110,measurementType:'standing_height'});
assert.equal(older.results.find(x=>x.indexType==='weight_for_age').validityStatus,'not_applicable');
assert.equal(older.results.find(x=>x.indexType==='height_for_age_5_19').validityStatus,'not_calculated');
assert.equal(older.results.find(x=>x.indexType==='bmi_for_age_5_19').validityStatus,'not_calculated');
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
// No official reference tables or independent official-output benchmark is bundled: clinical data remain disabled.
assert.equal(R.standards.WHO_CGS_2006.datasetStatus,'unavailable');
assert.equal(R.standards.WHO_GGR_2007.datasetStatus,'unavailable');
assert.equal(E.lmsZScore(NaN,0,10,0.1).zScore,null);
console.log('PASS BMI formula, units, missing and invalid inputs');
console.log('PASS LMS formula for nonzero L and near-zero L');
console.log('PASS LMS extreme correction and failure handling');
console.log('PASS WHO 0.7 cm length/height conversion');
console.log('PASS date/age validation and no reference extrapolation');
console.log('PASS index routing, sex/reference selection, missing and out-of-range data');
console.log('PASS index-specific Indonesian category thresholds');
console.log('PASS sex/standard-specific dataset selection and strict provenance/benchmark gate');
console.log('PASS no Z-score/category without official dataset; official benchmark gate remains blocked');
