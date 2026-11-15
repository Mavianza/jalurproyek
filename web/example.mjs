export const DEMO = {
  schemaVersion: 1,
  title: "Demo aplikasi kelompok",
  tasks: [
    { id: "A", name: "Susun kebutuhan", duration: 2, dependsOn: [] },
    { id: "B", name: "Desain antarmuka", duration: 3, dependsOn: ["A"] },
    { id: "C", name: "Siapkan dataset", duration: 4, dependsOn: ["A"] },
    { id: "D", name: "Bangun fitur", duration: 6, dependsOn: ["B", "C"] },
    { id: "E", name: "Uji integrasi", duration: 3, dependsOn: ["D"] },
    { id: "F", name: "Siapkan presentasi", duration: 4, dependsOn: ["B"] },
    { id: "G", name: "Demo akhir", duration: 1, dependsOn: ["E", "F"] },
  ],
};
