/* Pure, UI-independent anthropometry engine using the bundled WHO LMS datasets. */
(function (root) {
  "use strict";
  const ALGORITHM_VERSION = "klinik-anthro-engine/0.1.0";
  const REFERENCE_SCHEMA_VERSION = "lms-schema/1.0.0";
  const registry = () => root.GrowthReferenceData;

  function parseDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const d = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0,10)!==value ? null : d;
  }
  function getAge(dob, examDate) {
    const birth=parseDate(dob), exam=parseDate(examDate);
    if (!birth || !exam) return {valid:false, reason:"invalid_date"};
    if (exam < birth) return {valid:false, reason:"before_birth"};
    const ageDays=Math.round((exam-birth)/86400000);
    // WHO age-in-months convention for reference curves; exact age in days is retained for standards indexed by day.
    const ageMonths=ageDays/30.4375;
    let completedMonths=(exam.getUTCFullYear()-birth.getUTCFullYear())*12+exam.getUTCMonth()-birth.getUTCMonth();
    if (exam.getUTCDate()<birth.getUTCDate()) completedMonths--;
    return {valid:true, ageDays, ageMonths, completedMonths};
  }
  function calculateBMI(weightKg, lengthHeightCm) {
    const w=Number(weightKg), h=Number(lengthHeightCm);
    if (weightKg===null || weightKg===undefined || weightKg==="" || lengthHeightCm===null || lengthHeightCm===undefined || lengthHeightCm==="") return {status:"incomplete", value:null, reason:"missing_weight_or_height"};
    if (!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0) return {status:"failed_validation", value:null, reason:"weight_and_height_must_be_positive_finite_numbers"};
    const value=w/((h/100)**2);
    return Number.isFinite(value)?{status:"calculated",value}:{status:"failed_validation",value:null,reason:"bmi_not_finite"};
  }
  function correctLengthHeight(valueCm, measurementType, ageDays, completedMonths=null) {
    if (!Number.isFinite(Number(valueCm)) || Number(valueCm)<=0) return {status:"failed_validation",valueCm:null,reason:"invalid_length_height"};
    if (!["recumbent_length","standing_height"].includes(measurementType)) return {status:"incomplete",valueCm:null,reason:"measurement_position_required"};
    if (!Number.isFinite(ageDays)||ageDays<0) return {status:"failed_validation",valueCm:null,reason:"valid_age_required"};
    // WHO Anthro uses the 731-day boundary: age <731 days uses recumbent length;
    // age >=731 days uses standing height, regardless of the entered position.
    const under24Months=ageDays<731;
    if (under24Months && measurementType === "standing_height") return {status:"calculated",valueCm:Number(valueCm)+0.7,correctionCm:0.7,correctionApplied:true,reason:"standing_height_to_recumbent_length"};
    if (!under24Months && measurementType === "recumbent_length") return {status:"calculated",valueCm:Number(valueCm)-0.7,correctionCm:-0.7,correctionApplied:true,reason:"recumbent_length_to_standing_height"};
    return {status:"calculated",valueCm:Number(valueCm),correctionCm:0,correctionApplied:false,reason:null};
  }
  function lmsZScore(value, L, M, S, options={}) {
    const x=Number(value), l=Number(L), m=Number(M), s=Number(S);
    if (![x,l,m,s].every(Number.isFinite)||x<=0||m<=0||s<=0) return {status:"failed_validation",zScore:null,reason:"invalid_value_or_lms_parameters"};
    const nearZero=Math.abs(l)<1e-8;
    const raw=nearZero?Math.log(x/m)/s:((x/m)**l-1)/(l*s);
    if (!Number.isFinite(raw)) return {status:"failed_validation",zScore:null,reason:"lms_calculation_not_finite"};
    let z=raw, corrected=false;
    if (options.extremeCorrection !== false && raw>3) {
      const sd2=nearZero?m*Math.exp(2*s):m*((1+l*s*2)**(1/l));
      const sd3=nearZero?m*Math.exp(3*s):m*((1+l*s*3)**(1/l));
      if (![sd2,sd3].every(Number.isFinite)||sd3<=sd2) return {status:"failed_validation",zScore:null,reason:"upper_extreme_correction_unavailable"};
      z=3+(x-sd3)/(sd3-sd2); corrected=true;
    } else if (options.extremeCorrection !== false && raw < -3) {
      const sdMinus2=nearZero?m*Math.exp(-2*s):m*((1-l*s*2)**(1/l));
      const sdMinus3=nearZero?m*Math.exp(-3*s):m*((1-l*s*3)**(1/l));
      if (![sdMinus2,sdMinus3].every(Number.isFinite)||sdMinus2<=sdMinus3) return {status:"failed_validation",zScore:null,reason:"lower_extreme_correction_unavailable"};
      z=-3+(x-sdMinus3)/(sdMinus2-sdMinus3); corrected=true;
    }
    if (!Number.isFinite(z)) return {status:"failed_validation",zScore:null,reason:"zscore_not_finite"};
    return {status:"calculated",zScore:z,rawZScore:raw,extremeCorrectionApplied:corrected};
  }
  function interpolateLMS(dataset, axis) {
    if (!dataset || !Array.isArray(dataset.rows) || !dataset.rows.length) return {status:"unavailable_dataset",lms:null,reason:"reference_dataset_not_loaded"};
    if (!Number.isFinite(axis)) return {status:"failed_validation",lms:null,reason:"reference_axis_not_finite"};
    const rows=dataset.rows;
    if (axis<rows[0].axis || axis>rows[rows.length-1].axis) return {status:"out_of_reference_range",lms:null,reason:"no_extrapolation_outside_reference_dataset"};
    const exact=rows.find(row=>Math.abs(row.axis-axis)<1e-9);
    if (exact) return {status:"available",lms:{L:exact.L,M:exact.M,S:exact.S},axisUsed:axis};
    let i=1; while(i<rows.length && rows[i].axis<axis)i++;
    const a=rows[i-1], b=rows[i];
    if (!a||!b||b.axis===a.axis) return {status:"out_of_reference_range",lms:null,reason:"reference_interval_missing"};
    const t=(axis-a.axis)/(b.axis-a.axis);
    return {status:"available",lms:{L:a.L+(b.L-a.L)*t,M:a.M+(b.M-a.M)*t,S:a.S+(b.S-a.S)*t},axisUsed:axis,interpolated:true};
  }
  const categoryThresholds = Object.freeze({
    weight_for_age_under5:[[-Infinity,-3,"Berat badan sangat kurang"],[-3,-2,"Berat badan kurang"],[-2,1,"Berat badan normal"],[1,Infinity,"Risiko berat badan lebih"]],
    height_for_age:[[-Infinity,-3,"Sangat pendek"],[-3,-2,"Pendek"],[-2,3,"Dalam rentang rujukan"],[3,Infinity,"Tinggi; tinjau konteks klinis"]],
    weight_for_length_height:[[-Infinity,-3,"Gizi buruk (severely wasted)"],[-3,-2,"Gizi kurang (wasted)"],[-2,1,"Gizi baik"],[1,2,"Berisiko gizi lebih"],[2,3,"Gizi lebih"],[3,Infinity,"Obesitas"]],
    bmi_for_age_under5:[[-Infinity,-3,"Gizi buruk (severely wasted)"],[-3,-2,"Gizi kurang (wasted)"],[-2,1,"Gizi baik"],[1,2,"Berisiko gizi lebih"],[2,3,"Gizi lebih"],[3,Infinity,"Obesitas"]],
    bmi_for_age_5_19:[[-Infinity,-3,"Gizi buruk (severely thinness)"],[-3,-2,"Gizi kurang (thinness)"],[-2,1,"Gizi baik"],[1,2,"Gizi lebih (overweight)"],[2,Infinity,"Obesitas"]]
  });
  function classifyZScore(indexType, zScore) {
    if (!Number.isFinite(zScore)) return {category:null,threshold:null,status:"not_calculated"};
    const def=registry().indexDefinitions[indexType];
    if (!def?.thresholdSet || !categoryThresholds[def.thresholdSet]) return {category:null,threshold:null,status:"clinical_review_required",note:"Belum ada ambang kategori nasional yang dikonfigurasi untuk indeks ini."};
    let category, threshold;
    if (def.thresholdSet === "weight_for_age_under5") {
      if (zScore < -3) {category="Berat badan sangat kurang";threshold="Z < -3 SD";}
      else if (zScore < -2) {category="Berat badan kurang";threshold="-3 ≤ Z < -2 SD";}
      else if (zScore <= 1) {category="Berat badan normal";threshold="-2 ≤ Z ≤ +1 SD";}
      else {category="Risiko berat badan lebih";threshold="Z > +1 SD";}
    } else if (def.thresholdSet === "height_for_age") {
      if (zScore < -3) {category="Sangat pendek";threshold="Z < -3 SD";}
      else if (zScore < -2) {category="Pendek";threshold="-3 ≤ Z < -2 SD";}
      else if (zScore <= 3) {category="Dalam rentang rujukan";threshold="-2 ≤ Z ≤ +3 SD";}
      else {category="Tinggi; tinjau konteks klinis";threshold="Z > +3 SD";}
    } else if (["weight_for_length_height","bmi_for_age_under5"].includes(def.thresholdSet)) {
      if (zScore < -3) {category="Gizi buruk (severely wasted)";threshold="Z < -3 SD";}
      else if (zScore < -2) {category="Gizi kurang (wasted)";threshold="-3 ≤ Z < -2 SD";}
      else if (zScore <= 1) {category="Gizi baik";threshold="-2 ≤ Z ≤ +1 SD";}
      else if (zScore <= 2) {category="Berisiko gizi lebih";threshold="+1 < Z ≤ +2 SD";}
      else if (zScore <= 3) {category="Gizi lebih";threshold="+2 < Z ≤ +3 SD";}
      else {category="Obesitas";threshold="Z > +3 SD";}
    } else if (def.thresholdSet === "bmi_for_age_5_19") {
      if (zScore < -3) {category="Gizi buruk (severely thinness)";threshold="Z < -3 SD";}
      else if (zScore < -2) {category="Gizi kurang (thinness)";threshold="-3 ≤ Z < -2 SD";}
      else if (zScore <= 1) {category="Gizi baik";threshold="-2 ≤ Z ≤ +1 SD";}
      else if (zScore <= 2) {category="Gizi lebih (overweight)";threshold="+1 < Z ≤ +2 SD";}
      else {category="Obesitas";threshold="Z > +2 SD";}
    }
    return {category,threshold,status:category?"classified":"failed_validation"};
  }
  function evaluateIndex(indexType, patient, exam, age) {
    const def=registry().indexDefinitions[indexType];
    const standard=registry().standards[def.standard];
    const base={indexType,label:def.label,unit:def.unit,standardId:def.standard,referenceStandardVersion:standard.version,datasetVersion:standard.datasetVersion,algorithmVersion:ALGORITHM_VERSION,referenceSchemaVersion:REFERENCE_SCHEMA_VERSION,zScore:null,category:null,threshold:null,calculatedValue:null,validityStatus:"not_calculated",reason:null};
    if (!age.valid) return {...base,validityStatus:"failed_validation",reason:age.reason};
    if (age.ageMonths<def.minAgeMonths || age.ageMonths>=def.maxAgeMonthsExclusive) return {...base,validityStatus:"not_applicable",reason:"age_outside_index_scope"};
    if (!patient || !["male","female"].includes(patient.sexAtBirth)) return {...base,validityStatus:"incomplete",reason:"sex_missing_or_invalid"};
    const weightRelated=["weight_for_age","weight_for_age_5_10","weight_for_length_height","bmi_for_age_under5","bmi_for_age_5_19"].includes(indexType);
    const edemaStatus=["absent","present"].includes(exam?.edemaStatus)?exam.edemaStatus:"unknown";
    if (weightRelated && edemaStatus!=="absent") return {...base,validityStatus:"not_calculated",reason:edemaStatus==="present"?"edema_present_weight_based_index_withheld":"edema_status_unknown_weight_based_index_withheld"};
    const inputValues={...exam};
    const corrected=exam.lengthHeightCm===null||exam.lengthHeightCm===undefined||exam.lengthHeightCm===""?null:correctLengthHeight(exam.lengthHeightCm,exam.measurementType,age.ageDays,age.completedMonths);
    if (corrected?.status==="failed_validation") return {...base,validityStatus:"failed_validation",reason:corrected.reason};
    if (corrected?.status==="calculated") inputValues.correctedLengthHeightCm=corrected.valueCm;
    const bmi=calculateBMI(exam.weightKg,inputValues.correctedLengthHeightCm);
    inputValues.bmi=bmi.value;
    const missing=def.required.filter(key=>inputValues[key]===null||inputValues[key]===undefined||inputValues[key]===""||(key==="bmi"&&bmi.status!=="calculated"));
    if (missing.length) return {...base,validityStatus:"incomplete",reason:`missing_required_input:${missing.join(",")}`};
    const datasetMeasure= indexType==="weight_for_length_height" ? (age.ageDays<731?"recumbent_length":"standing_height") : null;
    const dataset=registry().getDataset(def.standard,indexType,patient.sexAtBirth,datasetMeasure);
    if (!dataset) return {...base,validityStatus:"not_calculated",reason:"verified_reference_dataset_not_loaded",datasetStatus:registry().datasetStatus(def.standard)};
    const axis=def.referenceAxis==="ageDays"?age.ageDays:def.referenceAxis==="ageMonths"?age.ageMonths:inputValues.correctedLengthHeightCm;
    const found=interpolateLMS(dataset,axis);
    if (found.status!=="available") return {...base,validityStatus:found.status,reason:found.reason};
    const valueKey=def.required[0];
    const measured=valueKey==="bmi"?bmi.value:valueKey==="lengthHeightCm"?inputValues.correctedLengthHeightCm:inputValues[valueKey];
    const z=lmsZScore(measured,found.lms.L,found.lms.M,found.lms.S,{extremeCorrection:dataset.extremeCorrection!==false});
    if (z.status!=="calculated") return {...base,validityStatus:z.status,reason:z.reason,calculatedValue:measured};
    const classified=indexType==="bmi_for_age_5_19"&&age.ageMonths>=228
      ? {category:null,threshold:null,status:"clinical_review_required",note:"Ambang kategori Permenkes berlaku sampai usia 18 tahun; usia 19 tahun memerlukan tinjauan kebijakan."}
      : classifyZScore(indexType,z.zScore);
    return {...base,calculatedValue:measured,zScore:z.zScore,category:classified.category,threshold:classified.threshold,validityStatus:"valid",interpretationStatus:classified.status==="classified"?"classified":"clinical_review_required",reason:classified.note||null,datasetVersion:dataset.datasetVersion,referenceSource:dataset.sourceUrl||standard.sourceUrl,calculationDetails:{axis,axisUnit:def.referenceAxis==="ageDays"?"days":def.referenceAxis==="ageMonths"?"months":"cm",lms:found.lms,rawZScore:z.rawZScore,extremeCorrectionApplied:z.extremeCorrectionApplied,measurementCorrection:corrected?.correctionCm??0}};
  }
  function evaluateExam(patient, exam) {
    const age=getAge(patient?.birthDate,exam?.examDate);
    const bmi=calculateBMI(exam?.weightKg,exam?.lengthHeightCm);
    const ranges=[["weightKg",0.1,300],["lengthHeightCm",20,250],["headCircumferenceCm",10,100],["midUpperArmCircumferenceCm",3,80]];
    const invalid=ranges.filter(([key,min,max])=>exam?.[key]!==null&&exam?.[key]!==undefined&&exam?.[key]!==""&&(!Number.isFinite(Number(exam[key]))||Number(exam[key])<min||Number(exam[key])>max));
    const invalidEdemaStatus=exam?.edemaStatus!==undefined&&! ["unknown","absent","present"].includes(exam.edemaStatus);
    if (!age.valid || invalid.length || invalidEdemaStatus || !patient || !["male","female"].includes(patient.sexAtBirth)) {
      const reason=!age.valid?age.reason:invalid.length?`measurement_out_of_range:${invalid.map(x=>x[0]).join(",")}`:invalidEdemaStatus?"edema_status_invalid":"sex_missing_or_invalid";
      return {algorithmVersion:ALGORITHM_VERSION,referenceSchemaVersion:REFERENCE_SCHEMA_VERSION,age,bmi,overallStatus:"failed_validation",validationErrors:[reason],results:Object.keys(registry().indexDefinitions).map(key=>({...evaluateIndex(key,patient,exam,age),validityStatus:"failed_validation",zScore:null,category:null,threshold:null,reason}))};
    }
    const results=[];
    const indexList=["weight_for_age","weight_for_age_5_10","height_for_age_under5","weight_for_length_height","bmi_for_age_under5","head_circumference_for_age","muac_for_age","height_for_age_5_19","bmi_for_age_5_19"];
    for (const indexType of indexList) results.push(evaluateIndex(indexType,patient,exam,age));
    return {algorithmVersion:ALGORITHM_VERSION,referenceSchemaVersion:REFERENCE_SCHEMA_VERSION,age,bmi,results,overallStatus:results.some(r=>r.validityStatus==="valid")?"partial":results.every(r=>["not_applicable","not_calculated"].includes(r.validityStatus))?"not_calculated":"review_required"};
  }
  root.PediatricGrowthEngine={ALGORITHM_VERSION,REFERENCE_SCHEMA_VERSION,parseDate,getAge,calculateBMI,correctLengthHeight,lmsZScore,interpolateLMS,classifyZScore,evaluateIndex,evaluateExam};
})(typeof window !== "undefined" ? window : globalThis);
