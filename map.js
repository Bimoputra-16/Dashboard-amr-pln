// 1. Inisialisasi Peta (Fokus ke Palembang)
const map = L.map('map').setView([-2.9828, 104.7567], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
}).addTo(map);

// 2. Fungsi Jam Real-Time
function updateClock() {
    const now = new Date();
    document.getElementById('clock').innerText = now.toLocaleTimeString('id-ID') + ' WIB';
}
setInterval(updateClock, 1000);
updateClock();

// 3. Variabel Global
let globalGeojsonData = null;
let markersLayer = L.layerGroup().addTo(map); // Wadah khusus titik
let heatLayer = null; // Wadah khusus heatmap
let isHeatmapActive = false;
let markersDict = {}; // Buat nyimpan memori fitur pencarian

// 4. Ambil Data GeoJSON Utama
fetch('Data/master_amr.geojson')
    .then(response => response.json())
    .then(data => {
        globalGeojsonData = data;
        renderDashboard('all'); // Tampilkan semua saat pertama kali buka
    })
    .catch(error => console.error("Gagal memuat file GeoJSON!", error));


// --- FUNGSI UTAMA: MENGGAMBAR ULANG PETA & KPI ---
function renderDashboard(providerFilter) {
    // Bersihkan layar dari data sebelumnya
    markersLayer.clearLayers();
    if (heatLayer) map.removeLayer(heatLayer);
    document.getElementById('offline-list').innerHTML = '';
    markersDict = {};
    
    let countTotal = 0, countOnline = 0, countOffline = 0;
    let heatData = []; // Array khusus buat nampung titik panas

    // Olah Data Baru
    L.geoJSON(globalGeojsonData, {
        // Filter Provider
        filter: function(feature) {
            if (providerFilter === 'all') return true;
            return feature.properties.Provider === providerFilter;
        },
        // Gambar Titik
        pointToLayer: function (feature, latlng) {
            let isOffline = feature.properties.Status === 'Offline';
            let warnaTitik = isOffline ? '#E74C3C' : '#2ECC71';
            
            countTotal++;
            if (isOffline) {
                countOffline++;
                // Masukkan titik offline ke data Heatmap
                heatData.push([latlng.lat, latlng.lng, 1]); 
            } else {
                countOnline++;
            }

            const marker = L.circleMarker(latlng, {
                radius: 8, fillColor: warnaTitik, color: '#FFFFFF', weight: 2, fillOpacity: 0.9
            });

            // Simpan ke memori untuk fitur Search
            markersDict[feature.properties.ID_Modem] = {
                layer: marker,
                latlng: latlng,
                nama: feature.properties.Nama_Trafo,
                id_pelanggan: feature.properties.ID_Pelanggan
            };

            return marker;
        },
        // Gambar Pop-up & Sidebar List
        onEachFeature: function (feature, layer) {
            let isOffline = feature.properties.Status === 'Offline';
            let keterangan = feature.properties.Keterangan || '-'; // Tarik data Keterangan
            
            // Siapkan tombol WA khusus kalau statusnya Offline
            let tombolWA = '';
            let infoPenyebab = ''; // Variabel buat kotak merah penyebab

            if (isOffline) {
                // Ambil koordinat untuk dikirim ke WA
                let lat = feature.geometry.coordinates[1];
                let lng = feature.geometry.coordinates[0];
                
                // Bikin Kotak Info Penyebab
                if (keterangan && keterangan !== '-') {
                    infoPenyebab = `
                        <div style="margin-top: 8px; padding: 6px; background-color: #FDEDEC; border: 1px solid #E74C3C; border-radius: 4px; color: #C0392B; font-size: 0.85rem; text-align: left;">
                            <strong>Penyebab:</strong><br>${keterangan}
                        </div>
                    `;
                }
                
                tombolWA = `
                    <button onclick="kirimWA('${feature.properties.Nama_Trafo}', '${feature.properties.ID_Modem}', '${feature.properties.ID_Pelanggan}', ${lat}, ${lng}, '${keterangan}')" 
                    style="margin-top: 10px; width: 100%; background-color: #25D366; color: white; border: none; padding: 8px; border-radius: 4px; cursor: pointer; font-family: 'Inter', sans-serif; font-weight: bold; font-size: 0.85rem;">
                        📱 Lapor via WhatsApp
                    </button>
                `;
            }

            // Desain isi Pop-up (Udah ditambah infoPenyebab)
            layer.bindPopup(`
                <div style="text-align: center; font-family: 'Inter', sans-serif; min-width: 180px;">
                    <strong>${feature.properties.Nama_Trafo}</strong><br>
                    <hr style="margin: 5px 0; border: 0.5px solid #eee;">
                    ID Pelanggan: <strong>${feature.properties.ID_Pelanggan}</strong><br>
                    Provider: <strong>${feature.properties.Provider || '-'}</strong><br>
                    ID Modem: ${feature.properties.ID_Modem}<br>
                    Status: <strong style="color: ${isOffline ? '#E74C3C' : '#2ECC71'}">${feature.properties.Status}</strong>
                    ${infoPenyebab}
                    ${tombolWA}
                </div>
            `);

            // Masukkan list ke Sidebar kiri jika Offline
            if (isOffline) {
                const li = document.createElement('li');
                li.className = 'offline-item';
                li.innerHTML = `
                    <div class="item-title">${feature.properties.Nama_Trafo}</div>
                    <div class="item-id">Prov: ${feature.properties.Provider} | Modem: ${feature.properties.ID_Modem}</div>
                `;
                
                li.onclick = () => {
                    // Kalau lagi mode Heatmap, matikan dulu biar keliatan titiknya
                    if(isHeatmapActive) document.getElementById('heatmap-btn').click();
                    
                    map.flyTo(markersDict[feature.properties.ID_Modem].latlng, 17, { animate: true, duration: 1.5 });
                    layer.openPopup();
                };
                
                document.getElementById('offline-list').appendChild(li);
            }
        }
    }).addTo(markersLayer); // Masukkan semua titik ke layer khusus

    // Update Angka KPI
    document.getElementById('kpi-total').innerText = countTotal;
    document.getElementById('kpi-online').innerText = countOnline;
    document.getElementById('kpi-offline').innerText = countOffline;
    let readRate = countTotal === 0 ? 0 : ((countOnline / countTotal) * 100).toFixed(1);
    document.getElementById('kpi-rate').innerText = readRate + '%';

    // Siapkan Layer Heatmap
    heatLayer = L.heatLayer(heatData, {
        radius: 30, blur: 20, maxZoom: 15,
        gradient: {0.4: 'blue', 0.6: 'lime', 0.8: 'yellow', 1.0: 'red'}
    });

    // Pertahankan tampilan kalau Heatmap lagi nyala pas filter diganti
    if (isHeatmapActive) {
        map.removeLayer(markersLayer);
        heatLayer.addTo(map); 
    } else {
        map.addLayer(markersLayer);
    }
}

// --- EVENT LISTENER (Logika Tombol Interaktif) ---

// 1. Saat Dropdown Provider Diganti
document.getElementById('provider-filter').addEventListener('change', function(e) {
    renderDashboard(e.target.value);
});

// 2. Saat Tombol Heatmap Diklik
document.getElementById('heatmap-btn').addEventListener('click', function() {
    isHeatmapActive = !isHeatmapActive;
    
    if (isHeatmapActive) {
        this.classList.add('active');
        this.innerText = '❌ Tutup Heatmap';
        map.removeLayer(markersLayer); 
        if(heatLayer) heatLayer.addTo(map); 
    } else {
        this.classList.remove('active');
        this.innerText = '🔥 Mode Heatmap';
        if(heatLayer) map.removeLayer(heatLayer); 
        map.addLayer(markersLayer); 
    }
});

// 3. Fitur Pencarian (Search)
function cariModem() {
    const keyword = document.getElementById('search-input').value.toLowerCase();
    if (!keyword) return;

    let found = false;
    for (const id in markersDict) {
        const data = markersDict[id];
        const nama = data.nama ? data.nama.toLowerCase() : "";
        const idModem = id.toLowerCase();
        const idPel = data.id_pelanggan ? String(data.id_pelanggan).toLowerCase() : "";

        if (idModem.includes(keyword) || nama.includes(keyword) || idPel.includes(keyword)) {
            if(isHeatmapActive) document.getElementById('heatmap-btn').click();

            map.flyTo(data.latlng, 17, { animate: true, duration: 1.5 });
            data.layer.openPopup();
            found = true;
            break;
        }
    }
    if (!found) alert("Data tidak ditemukan pada Provider ini!");
}

document.getElementById('search-btn').addEventListener('click', cariModem);
document.getElementById('search-input').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') cariModem();
});

// --- FITUR LAPOR WHATSAPP ---
// (Udah ditambahin parameter penyebab)
function kirimWA(namaTrafo, idModem, idPelanggan, lat, lng, penyebab) {
    const nomorTujuan = "6285766905841"; 
    
    // Format pesan sekarang mencakup penyebab error
    const pesan = `⚠️ *LAPORAN GANGGUAN AMR PLN ULP RIVAI* ⚠️%0A%0A*Nama Trafo:* ${namaTrafo}%0A*ID Pelanggan:* ${idPelanggan}%0A*ID Modem:* ${idModem}%0A*Status:* OFFLINE 🔴%0A*Indikasi Penyebab:* ${penyebab}%0A%0A*Titik Maps:*%0Ahttps://www.google.com/maps?q=${lat},${lng}%0A%0AMohon bantuan tim lapangan untuk segera melakukan pengecekan.`;
    
    // Buka link WA
    const linkWA = `https://wa.me/${nomorTujuan}?text=${pesan}`;
    window.open(linkWA, '_blank');
}