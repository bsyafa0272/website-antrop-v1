/*
 * Dataset fixture untuk demonstrasi saja. Semua entitas memiliki isDemo: true.
 * Tidak ada pasien nyata atau hasil interpretasi klinis di file ini.
 */
(() => {
  "use strict";
  window.DemoSeedData = {
    mode: "simulation",
    schemaVersion: 2,
    patients: [
      {id:"DEMO-001",medicalRecordNumber:"DEMO-0001",name:"Ananda Putri",birthDate:"2022-03-18",sexAtBirth:"female",gestationalAgeAtBirth:{weeks:39,days:0},guardianName:"Wali simulasi A",clinicalNotes:"Profil sintetis untuk menguji relasi data.",createdAt:"2026-09-01T08:00:00.000Z",updatedAt:"2026-09-01T08:00:00.000Z",isDemo:true},
      {id:"DEMO-002",medicalRecordNumber:"DEMO-0002",name:"Raka Pratama",birthDate:"2020-07-02",sexAtBirth:"male",gestationalAgeAtBirth:{weeks:38,days:2},guardianName:"Wali simulasi B",clinicalNotes:"Profil sintetis untuk menguji relasi data.",createdAt:"2026-09-01T08:10:00.000Z",updatedAt:"2026-09-01T08:10:00.000Z",isDemo:true},
      {id:"DEMO-003",medicalRecordNumber:"DEMO-0003",name:"Nadia Safitri",birthDate:"2024-01-11",sexAtBirth:"female",gestationalAgeAtBirth:null,guardianName:"Wali simulasi C",clinicalNotes:"Informasi gestasi tidak dicantumkan pada contoh ini.",createdAt:"2026-09-01T08:20:00.000Z",updatedAt:"2026-09-01T08:20:00.000Z",isDemo:true},
      {id:"DEMO-004",medicalRecordNumber:"DEMO-0004",name:"Bima Aditya",birthDate:"2019-11-25",sexAtBirth:"male",gestationalAgeAtBirth:{weeks:40,days:0},guardianName:"Wali simulasi D",clinicalNotes:"Profil sintetis tanpa interpretasi klinis.",createdAt:"2026-09-01T08:30:00.000Z",updatedAt:"2026-09-01T08:30:00.000Z",isDemo:true}
    ],
    exams: [
      {id:"EX-DEMO-101",patientId:"DEMO-001",rmeVisitId:null,examDate:"2026-07-08",weightKg:14.6,lengthHeightCm:96.8,measurementType:"standing_height",headCircumferenceCm:49.1,midUpperArmCircumferenceCm:null,notes:"Pengukuran simulasi.",recordedBy:null,createdAt:"2026-07-08T03:00:00.000Z",updatedAt:"2026-07-08T03:00:00.000Z",verificationStatus:"pending",dataValidationStatus:"valid",interpretationStatus:"not_calculated",isDemo:true},
      {id:"EX-DEMO-102",patientId:"DEMO-001",rmeVisitId:null,examDate:"2026-10-08",weightKg:15.2,lengthHeightCm:98.1,measurementType:"standing_height",headCircumferenceCm:49.4,midUpperArmCircumferenceCm:15.2,notes:"Pengukuran simulasi terbaru.",recordedBy:null,createdAt:"2026-10-08T03:00:00.000Z",updatedAt:"2026-10-08T03:00:00.000Z",verificationStatus:"pending",dataValidationStatus:"valid",interpretationStatus:"not_calculated",isDemo:true},
      {id:"EX-DEMO-103",patientId:"DEMO-002",rmeVisitId:null,examDate:"2026-05-12",weightKg:17.8,lengthHeightCm:109.4,measurementType:"standing_height",headCircumferenceCm:null,midUpperArmCircumferenceCm:null,notes:"Pengukuran simulasi.",recordedBy:null,createdAt:"2026-05-12T02:30:00.000Z",updatedAt:"2026-05-12T02:30:00.000Z",verificationStatus:"pending",dataValidationStatus:"valid",interpretationStatus:"not_calculated",isDemo:true},
      {id:"EX-DEMO-104",patientId:"DEMO-002",rmeVisitId:null,examDate:"2026-10-07",weightKg:18.4,lengthHeightCm:111.2,measurementType:"standing_height",headCircumferenceCm:null,midUpperArmCircumferenceCm:16.1,notes:"Pengukuran simulasi terbaru.",recordedBy:null,createdAt:"2026-10-07T02:45:00.000Z",updatedAt:"2026-10-07T02:45:00.000Z",verificationStatus:"pending",dataValidationStatus:"valid",interpretationStatus:"not_calculated",isDemo:true},
      {id:"EX-DEMO-105",patientId:"DEMO-003",rmeVisitId:null,examDate:"2026-03-10",weightKg:10.2,lengthHeightCm:78.8,measurementType:"recumbent_length",headCircumferenceCm:46.8,midUpperArmCircumferenceCm:null,notes:"Pengukuran simulasi.",recordedBy:null,createdAt:"2026-03-10T03:10:00.000Z",updatedAt:"2026-03-10T03:10:00.000Z",verificationStatus:"pending",dataValidationStatus:"valid",interpretationStatus:"not_calculated",isDemo:true},
      {id:"EX-DEMO-106",patientId:"DEMO-004",rmeVisitId:null,examDate:"2026-10-02",weightKg:21.1,lengthHeightCm:null,measurementType:"standing_height",headCircumferenceCm:null,midUpperArmCircumferenceCm:null,notes:"Contoh catatan tidak lengkap: ukuran panjang/tinggi belum tersedia.",recordedBy:null,createdAt:"2026-10-02T03:00:00.000Z",updatedAt:"2026-10-02T03:00:00.000Z",verificationStatus:"pending",dataValidationStatus:"incomplete",interpretationStatus:"incomplete",isDemo:true}
    ],
    interpretations: [],
    auditEvents: []
  };
})();
