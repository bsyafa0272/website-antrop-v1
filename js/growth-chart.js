/* Model dan SVG kurva longitudinal; tanpa ketergantungan DOM untuk pengujian unit. */
(function (root) {
  "use strict";
  const DAY_MONTH = 30.4375;
  const INDEXES = Object.freeze({
    weight_for_age: {label:"Berat badan menurut umur (BB/U)", unit:"kg", minMonths:0, maxMonthsExclusive:60, valueKey:"weightKg", refs:[{minMonths:0,maxMonthsExclusive:60,standardId:"WHO_CGS_2006",indexType:"weight_for_age",axis:"ageDays"}]},
    weight_for_age_5_10: {label:"Berat badan menurut umur (BB/U, 5–10 tahun)", unit:"kg", minMonths:60, maxMonthsExclusive:121, valueKey:"weightKg", refs:[{minMonths:60,maxMonthsExclusive:121,standardId:"WHO_GGR_2007",indexType:"weight_for_age_5_10",axis:"ageMonths"}]},
    height_for_age: {label:"Panjang/tinggi badan menurut umur (PB/TB/U)", unit:"cm", minMonths:0, maxMonthsExclusive:229, valueKey:"lengthHeightCm", refs:[{minMonths:0,maxMonthsExclusive:60,standardId:"WHO_CGS_2006",indexType:"height_for_age_under5",axis:"ageDays"},{minMonths:60,maxMonthsExclusive:229,standardId:"WHO_GGR_2007",indexType:"height_for_age_5_19",axis:"ageMonths"}]},
    bmi_for_age: {label:"IMT menurut umur (IMT/U)", unit:"kg/m²", minMonths:0, maxMonthsExclusive:229, valueKey:"bmi", refs:[{minMonths:0,maxMonthsExclusive:60,standardId:"WHO_CGS_2006",indexType:"bmi_for_age_under5",axis:"ageDays"},{minMonths:60,maxMonthsExclusive:229,standardId:"WHO_GGR_2007",indexType:"bmi_for_age_5_19",axis:"ageMonths"}]},
    head_circumference_for_age: {label:"Lingkar kepala menurut umur (LK/U)", unit:"cm", minMonths:0, maxMonthsExclusive:60, valueKey:"headCircumferenceCm", refs:[{minMonths:0,maxMonthsExclusive:60,standardId:"WHO_CGS_2006",indexType:"head_circumference_for_age",axis:"ageDays"}]},
    muac_for_age: {label:"Lingkar lengan atas menurut umur (LiLA/U)", unit:"cm", minMonths:3, maxMonthsExclusive:60, valueKey:"midUpperArmCircumferenceCm", refs:[{minMonths:3,maxMonthsExclusive:60,standardId:"WHO_CGS_2006",indexType:"muac_for_age",axis:"ageDays"}]}
  });

  function referenceForAge(config, ageMonths) {
    return config.refs.find(ref => ageMonths >= ref.minMonths && ageMonths < ref.maxMonthsExclusive) || null;
  }
  function availableIndexes(patient, exams, engine) {
    if (!patient) return [];
    const dates = (exams || []).filter(e => e.patientId === patient.id).map(e => e.examDate).filter(Boolean).sort();
    const referenceDate = dates[dates.length-1] || new Date().toISOString().slice(0,10);
    const age = engine.getAge(patient.birthDate, referenceDate);
    if (!age.valid) return [];
    const months = age.ageMonths;
    return Object.entries(INDEXES).filter(([,c]) => age.ageMonths >= c.minMonths && age.ageMonths < c.maxMonthsExclusive)
      .map(([value,c]) => ({value,label:c.label,unit:c.unit}));
  }
  function getRawValue(indexType, patient, exam, age, engine) {
    const cfg = INDEXES[indexType];
    if (!cfg) return {value:null,reason:"unknown_index"};
    const months=age.ageMonths;
    if (age.ageMonths < cfg.minMonths || age.ageMonths >= cfg.maxMonthsExclusive || !referenceForAge(cfg,age.ageMonths)) return {value:null,reason:"outside_index_age_coverage"};
    if (indexType === "weight_for_age") return Number.isFinite(Number(exam.weightKg)) && exam.weightKg!==null && exam.weightKg!=="" ? {value:Number(exam.weightKg)} : {value:null,reason:"missing_weight"};
    if (indexType === "height_for_age") {
      if (exam.lengthHeightCm===null || exam.lengthHeightCm===undefined || exam.lengthHeightCm==="") return {value:null,reason:"missing_length_height"};
      const corrected=engine.correctLengthHeight(Number(exam.lengthHeightCm),exam.measurementType,age.ageDays,age.completedMonths);
      return corrected.status==="calculated"?{value:corrected.valueCm,correctionCm:corrected.correctionCm||0}:{value:null,reason:corrected.reason||"invalid_length_height"};
    }
    if (indexType === "bmi_for_age") {
      if (exam.weightKg===null||exam.weightKg===undefined||exam.weightKg===""||exam.lengthHeightCm===null||exam.lengthHeightCm===undefined||exam.lengthHeightCm==="") return {value:null,reason:"missing_weight_or_height"};
      const corrected=engine.correctLengthHeight(Number(exam.lengthHeightCm),exam.measurementType,age.ageDays,age.completedMonths);
      if(corrected.status!=="calculated") return {value:null,reason:corrected.reason||"invalid_length_height"};
      const bmi=engine.calculateBMI(Number(exam.weightKg),corrected.valueCm);
      return bmi.status==="calculated"?{value:bmi.value,correctionCm:corrected.correctionCm||0}:{value:null,reason:bmi.reason||"bmi_not_calculated"};
    }
    const raw=exam[cfg.valueKey];
    return raw!==null&&raw!==undefined&&raw!==""&&Number.isFinite(Number(raw))?{value:Number(raw)}:{value:null,reason:`missing_${cfg.valueKey}`};
  }
  function buildModel({patient, exams, indexType, engine, referenceData}) {
    const cfg=INDEXES[indexType];
    if(!cfg) return {status:"invalid_index",indexType,points:[],segments:[],curves:[],excluded:[],warnings:["Indeks tidak dikenal."],unit:"",label:""};
    if(!patient) return {status:"no_patient",indexType,points:[],segments:[],curves:[],excluded:[],warnings:["Pilih pasien untuk melihat riwayat pertumbuhan."],unit:cfg.unit,label:cfg.label};
    const patientExams=(exams||[]).filter(e=>e.patientId===patient.id).slice().sort((a,b)=>String(a.examDate||"").localeCompare(String(b.examDate||""))||String(a.createdAt||"").localeCompare(String(b.createdAt||""))||String(a.id||"").localeCompare(String(b.id||"")));
    const points=[],excluded=[],byDate=new Map();
    for(const e of patientExams){
      const age=engine.getAge(patient.birthDate,e.examDate);
      if(!age.valid){excluded.push({examId:e.id,date:e.examDate,reason:"invalid_exam_date_or_before_birth"});continue;}
      const months=age.ageMonths;
      const ref=referenceForAge(cfg,age.ageMonths);
      if(!ref){excluded.push({examId:e.id,date:e.examDate,ageMonths:months,reason:"outside_reference_age_coverage"});continue;}
      const weightRelated=["weight_for_age","weight_for_age_5_10","bmi_for_age"].includes(indexType);
      const edemaStatus=["absent","present"].includes(e.edemaStatus)?e.edemaStatus:"unknown";
      if(weightRelated&&edemaStatus!=="absent"){excluded.push({examId:e.id,date:e.examDate,ageMonths:months,reason:edemaStatus==="present"?"edema_present_weight_based_index_withheld":"edema_status_unknown_weight_based_index_withheld"});continue;}
      if(e.dataValidationStatus==="failed_validation"||e.verificationStatus==="failed_validation") { excluded.push({examId:e.id,date:e.examDate,ageMonths:months,reason:"measurement_failed_validation"}); continue; }
      const raw=getRawValue(indexType,patient,e,age,engine);
      if(raw.value===null){excluded.push({examId:e.id,date:e.examDate,ageMonths:months,reason:raw.reason||"incomplete_measurement"});continue;}
      const dataset=referenceData?.getDataset(ref.standardId,ref.indexType,patient.sexAtBirth)||null;
      let zScore=null,referenceStatus="unavailable",standardLabel=ref.standardId;
      if(dataset){
        const axis=ref.axis==="ageDays"?age.ageDays:age.ageMonths;
        const lms=engine.interpolateLMS(dataset,axis);
        if(lms.status==="available"){
          const z=engine.lmsZScore(raw.value,lms.lms.L,lms.lms.M,lms.lms.S,{extremeCorrection:dataset.extremeCorrection!==false});
          if(z.status==="calculated"){zScore=z.zScore;referenceStatus="validated";} else referenceStatus=z.reason||z.status;
        } else referenceStatus=lms.reason||lms.status;
        standardLabel=`${ref.standardId} · ${dataset.datasetVersion}`;
      }
      const point={examId:e.id,date:e.examDate,ageDays:age.ageDays,ageMonths:months,ageLabel:`${Math.floor(months/12)} th ${Math.floor(months%12)} bl`,value:raw.value,unit:cfg.unit,reason:null,measurementStatus:e.dataValidationStatus||"unknown",referenceStatus,zScore,standardId:ref.standardId,standardLabel,measurementType:e.measurementType||null,correctionCm:raw.correctionCm||0,notes:e.notes||null};
      points.push(point); byDate.set(point.date,(byDate.get(point.date)||0)+1);
    }
    points.forEach(p=>{if((byDate.get(p.date)||0)>1)p.sameDate=true;});
    const segments=[]; let run=[];
    const flush=()=>{if(run.length>=2)segments.push(run.map(p=>p.examId));run=[];};
    // Missing/out-of-scope visits and duplicate dates break continuity instead of silently bridging gaps.
    for(const e of patientExams){
      const matching=points.filter(p=>p.examId===e.id);
      if(matching.length!==1 || matching[0].sameDate){flush();continue;}
      if(run.length && run[run.length-1].date===matching[0].date)flush();
      run.push(matching[0]);
    }
    flush();
    const curves=[];
    const curveSources=[];
    for(const ref of cfg.refs){
      const dataset=referenceData?.getDataset(ref.standardId,ref.indexType,patient.sexAtBirth)||null;
      if(!dataset) continue;
      curveSources.push({standardId:ref.standardId,datasetVersion:dataset.datasetVersion,sourceUrl:dataset.sourceUrl,license:dataset.license});
      const zValues=[-3,-2,-1,0,1,2,3];
      for(const z of zValues){
        const samples=[];
        for(const row of dataset.rows){
          const x=ref.axis==="ageDays"?row.axis/DAY_MONTH:row.axis;
          if(x<ref.minMonths||x>=ref.maxMonthsExclusive)continue;
          const L=Number(row.L),M=Number(row.M),S=Number(row.S);
          const base=1+L*S*z;
          const y=Math.abs(L)<1e-8?M*Math.exp(S*z):(base>0?M*Math.pow(base,1/L):NaN);
          if(Number.isFinite(x)&&Number.isFinite(y)&&y>0)samples.push({x,y});
        }
        if(samples.length>1)curves.push({z,standardId:ref.standardId,points:samples});
      }
    }
    const warnings=[];
    if(!patientExams.length)warnings.push("Belum ada riwayat pengukuran untuk pasien ini.");
    if(patientExams.length&&!points.length)warnings.push("Tidak ada titik yang dapat diplot untuk indeks ini. Periksa kelengkapan pengukuran dan cakupan usia.");
    if(points.some(p=>p.referenceStatus!=="validated"))warnings.push("Kurva/interpretasi WHO tidak tersedia untuk sebagian atau seluruh titik karena dataset resmi tervalidasi belum terpasang. Titik yang terlihat hanya nilai ukur, bukan kategori klinis.");
    if(excluded.length)warnings.push(`${excluded.length} catatan tidak diplot karena data tidak lengkap, tanggal tidak valid, atau usia di luar cakupan indeks.`);
    if(points.some(p=>p.sameDate))warnings.push("Ada lebih dari satu pemeriksaan pada tanggal yang sama. Titik ditampilkan terpisah dan garis longitudinal diputus di tanggal tersebut.");
    if(excluded.some(e=>e.reason==="edema_present_weight_based_index_withheld"))warnings.push("Titik berbasis berat badan tidak diplot pada pemeriksaan dengan edema.");
    if(excluded.some(e=>e.reason==="edema_status_unknown_weight_based_index_withheld"))warnings.push("Titik berbasis berat badan tidak diplot karena status edema belum dikonfirmasi.");
    const referenceSource=curves.length?[...new Set(curveSources.map(s=>`${s.standardId} ${s.datasetVersion} · ${s.sourceUrl||"sumber tidak dicantumkan"} · lisensi: ${s.license||"tidak dicantumkan"}`))].join("; "):"Dataset kurva WHO resmi belum tersedia";
    return {status:points.length?"has_data":"empty",indexType,label:cfg.label,unit:cfg.unit,axisLabel:"Usia saat pemeriksaan (bulan; dihitung dari tanggal lahir dan tanggal pemeriksaan)",points,segments,curves,curveSources,excluded,warnings,referenceAvailable:curves.length>0,referenceSource,sex:patient.sexAtBirth,patientId:patient.id,synthetic:patient.isDemo===true};
  }
  function renderSvg(model) {
    const W=920,H=430,L=76,R=24,T=24,B=66,innerW=W-L-R,innerH=H-T-B;
    if(!model||(!model.points?.length&&!model.curves?.length))return `<div class="growth-empty" role="status"><strong>Belum cukup data untuk menggambar kurva</strong><p>${(model?.warnings||["Pilih pasien dan indeks."]).map(escapeText).join(" ")}</p></div>`;
    const all=[...model.points.map(p=>({x:p.ageMonths,y:p.value})),...model.curves.flatMap(c=>c.points)];
    let xmin=Math.min(0,...all.map(p=>p.x)),xmax=Math.max(12,...all.map(p=>p.x));
    const ymin0=Math.min(...all.map(p=>p.y)),ymax0=Math.max(...all.map(p=>p.y));
    let ymin=Math.max(0,ymin0-(ymax0-ymin0||1)*.12),ymax=ymax0+(ymax0-ymin0||1)*.12;
    if(ymax===ymin){ymax=ymin+1;}
    const X=x=>L+(x-xmin)/(xmax-xmin||1)*innerW, Y=y=>T+innerH-(y-ymin)/(ymax-ymin)*innerH;
    const pieces=[];
    for(let i=0;i<=5;i++){const y=ymin+(ymax-ymin)*i/5, py=Y(y);pieces.push(`<line class="chart-grid" x1="${L}" y1="${py}" x2="${W-R}" y2="${py}"/><text class="chart-tick" x="${L-10}" y="${py+4}" text-anchor="end">${y.toFixed(ymax-ymin<10?1:0)}</text>`);}
    const xStep=(xmax-xmin)<=36?6:Math.max(12,Math.ceil((xmax-xmin)/6/12)*12);
    const start=Math.ceil(xmin/xStep)*xStep;
    for(let x=start;x<=xmax;x+=xStep){const px=X(x);pieces.push(`<line class="chart-grid chart-grid-vertical" x1="${px}" y1="${T}" x2="${px}" y2="${H-B}"/><text class="chart-tick" x="${px}" y="${H-B+22}" text-anchor="middle">${x}</text>`);}
    pieces.push(`<line class="chart-axis" x1="${L}" y1="${T}" x2="${L}" y2="${H-B}"/><line class="chart-axis" x1="${L}" y1="${H-B}" x2="${W-R}" y2="${H-B}"/>`);
    const curveColors={"-3":"#7c3aed","-2":"#2563eb","-1":"#0f766e","0":"#334155","1":"#0f766e","2":"#2563eb","3":"#7c3aed"};
    const curveDashes={"-3":"2 3","-2":"7 3","-1":"3 2 1 2","0":"none","1":"10 2 2 2","2":"1 2","3":"7 2 2 2"};
    for(const curve of model.curves){const d=curve.points.map((p,i)=>`${i?"L":"M"}${X(p.x).toFixed(2)},${Y(p.y).toFixed(2)}`).join(" ");pieces.push(`<path d="${d}" class="reference-curve" stroke="${curveColors[String(curve.z)]||"#64748b"}" stroke-dasharray="${curveDashes[String(curve.z)]||"5 4"}" aria-label="WHO ${escapeText(curve.standardId)} Z=${curve.z}"><title>WHO ${escapeText(curve.standardId)} Z=${curve.z}</title></path>`);}
    const byId=new Map(model.points.map(p=>[p.examId,p]));
    for(const ids of model.segments){const ps=ids.map(id=>byId.get(id)).filter(Boolean);if(ps.length>1){const d=ps.map((p,i)=>`${i?"L":"M"}${X(p.ageMonths).toFixed(2)},${Y(p.value).toFixed(2)}`).join(" ");pieces.push(`<path d="${d}" class="patient-trajectory"/>`);}}
    for(const p of model.points){const px=X(p.ageMonths),py=Y(p.value),label=`${p.date}; usia ${p.ageLabel}; ${p.value.toFixed(2)} ${model.unit}; ${p.zScore===null?"Z-score tidak tersedia":`Z ${p.zScore.toFixed(2)}`}`;pieces.push(`<g class="patient-point"><title>${escapeText(label)}</title><circle cx="${px}" cy="${py}" r="6" class="patient-point-ring"/><circle cx="${px}" cy="${py}" r="2.5" class="patient-point-core"/><circle cx="${px}" cy="${py}" r="11" class="patient-point-hit" tabindex="0" role="button" aria-label="Buka detail pemeriksaan ${escapeText(p.date)}" data-action="growthPoint" data-id="${escapeText(p.examId)}"/></g>`);}
    pieces.push(`<text class="chart-axis-label" x="${L+innerW/2}" y="${H-14}" text-anchor="middle">Usia saat pemeriksaan (bulan)</text><text class="chart-axis-label" transform="translate(20 ${T+innerH/2}) rotate(-90)" text-anchor="middle">${escapeText(model.label)} (${escapeText(model.unit)})</text>`);
    return `<div class="growth-svg-wrap"><svg class="growth-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeText(model.label)} menurut usia, ${model.points.length} titik pemeriksaan">${pieces.join("")}</svg></div>`;
  }
  function escapeText(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function csvRows(model){return [["exam_id","tanggal_pemeriksaan","usia_hari","usia_bulan","indeks","nilai","satuan","z_score","status_referensi","standar_referensi","status_data"],...(model?.points||[]).map(p=>[p.examId,p.date,p.ageDays,p.ageMonths.toFixed(4),model.indexType,p.value,p.unit,p.zScore===null?"":p.zScore,p.referenceStatus,p.standardLabel,p.measurementStatus])];}
  root.PediatricGrowthChart={INDEXES,availableIndexes,buildModel,renderSvg,csvRows};
})(typeof window!=="undefined"?window:globalThis);
