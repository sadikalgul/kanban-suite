# Kanban Analytics Suite - Proje Dokümantasyonu

## 1. Projenin Genel Tanımı ve Amacı
**Kanban Analytics Suite**, Kanban metodolojisi ile çalışan yazılım geliştirme ve proje yönetimi ekipleri için tasarlanmış, web tabanlı bir veri analitiği ve görselleştirme aracıdır. 

Bu projenin temel amacı, ekiplerin tarihsel verilerini (Excel formatında) kullanarak süreç performanslarını ölçmelerini, darboğazları tespit etmelerini ve **Monte Carlo Simülasyonu** gibi ileri düzey istatistiksel yöntemlerle geleceğe yönelik gerçekçi tahminler (forecasting) yapmalarını sağlamaktır. Uygulama, verileri tamamen tarayıcı üzerinde işleyerek (client-side), herhangi bir sunucuya veri göndermeden güvenli ve hızlı bir analiz imkanı sunar.

## 2. Proje Kapsamı ve Hedefleri
### Kapsam
Proje, kullanıcıların ham iş takip verilerini (Jira, Azure DevOps veya manuel Excel tabloları) anlamlı grafiklere ve metriklerine dönüştüren tek sayfalık bir uygulamayı (SPA) kapsar. 
*   **Giriş:** .xlsx veya .xls formatındaki Excel dosyaları.
*   **İşlem:** Veri temizleme, kolon eşleştirme, metrik hesaplama (Cycle Time, Throughput, WIP).
*   **Çıktı:** Etkileşimli grafikler (CFD, Throughput, Histogram), istatistiksel özetler ve indirilebilir raporlar.

### Hedefler
*   **Süreç Görünürlüğü:** İş akışındaki birikmeleri ve darboğazları görünür kılmak.
*   **Veriye Dayalı Karar:** Tahminleri hislere değil, tarihsel veriye (Throughput) dayandırmak.
*   **Kullanım Kolaylığı:** Karmaşık kurulumlar gerektirmeden, sadece bir Excel dosyası ile saniyeler içinde analiz yapabilmek.
*   **Eğitici İçgörü:** CFD analizi ile otomatik uyarılar (örn: "Artan WIP Trendi") üreterek kullanıcıyı yönlendirmek.

## 3. Kullanılan Teknolojiler ve Altyapı Detayları
Proje, modern frontend teknolojileri kullanılarak geliştirilmiştir:

*   **Core Framework:** React 19
*   **Build Tool:** Vite (Hızlı geliştirme ve optimize edilmiş build için)
*   **Programlama Dili:** JavaScript (ES6+) / JSX
*   **Stil Şablonu:** Tailwind CSS v4 (Utility-first CSS framework)
*   **Veri İşleme:** 
    *   `xlsx` (SheetJS): Excel dosyalarını tarayıcıda okumak ve parse etmek için.
*   **Görselleştirme:** 
    *   `recharts`: React tabanlı, responsive grafik kütüphanesi (Area, Bar, Line, Composed Charts).
    *   `lucide-react`: Modern ve hafif ikon seti.
*   **Dağıtım (Deployment):** Statik web sitesi olarak herhangi bir CDN (Vercel, Netlify, GitHub Pages) üzerinde çalışabilir.

## 4. Proje Mimarisi ve Bileşen Diyagramları
Proje, "Monolithic Component" yapısına yakın, ancak mantıksal olarak ayrılmış bir mimariye sahiptir. Ana mantık `KanbanAnalyticsSuite.jsx` dosyasında toplanmıştır.

### Mimari Akış
1.  **Veri Katmanı:** Kullanıcı Excel dosyasını yükler -> `FileReader` ve `XLSX` kütüphanesi veriyi JSON formatına çevirir.
2.  **Konfigürasyon Katmanı:** Kullanıcı UI üzerinden kolon eşleştirmelerini (Tarih, İstasyonlar, Start/End) yapar.
3.  **Hesaplama Motoru (Engine):** 
    *   `calculateCFD`: Günlük kümülatif akışı hesaplar.
    *   `calcCycleTimeData`: Her işin başlangıç ve bitiş sürelerini hesaplar.
    *   `runMonteCarloSimulation`: 10.000 iterasyon ile olasılıksal tahminleme yapar.
4.  **Sunum Katmanı (View):** Hesaplanan veriler `recharts` bileşenlerine ve özet tablolara aktarılır.

### Dosya Yapısı
```
src/
├── KanbanAnalyticsSuite.jsx  # Ana Uygulama Mantığı ve UI
├── App.jsx                   # Root Component
├── main.jsx                  # Entry Point
└── index.css                 # Tailwind importları
```

## 5. Temel İşlevsellikler ve Özellikler
### A. Veri Yükleme ve Yapılandırma
*   Sürükle-bırak Excel yükleme.
*   Dinamik kolon tespiti ve eşleştirme.
*   İstasyon (kolon) sırasını sürükleyerek veya butonlarla düzenleme.

### B. Cumulative Flow Diagram (CFD)
*   Zaman içindeki iş dağılımını (To Do, In Progress, Done) gösteren alan grafiği.
*   **Otomatik Analiz:** Darboğazlar, WIP artışları ve yüksek dalgalanmalar için akıllı uyarı sistemi.
*   Zoom/Tam Ekran modu.

### C. Cycle Time Analizi
*   Her bir işin (PBI) ne kadar sürede tamamlandığının hesaplanması.
*   Min, Max, Ortalama, Medyan ve %85 (Percentile) istatistikleri.
*   Verilerin CSV olarak dışa aktarımı.

### D. Throughput Trendi
*   Aylık tamamlanan iş sayısı.
*   Hareketli Ortalama (Moving Average - 2, 3, 4, 6 aylık) çizgisi ile trend takibi.

### E. Monte Carlo Simülasyonu
*   **"Ne Kadar İş?" (How Many):** Belirli bir tarihe kadar kaç işin biteceğini tahminler.
*   **"Ne Zaman Biter?" (When):** Belirli sayıdaki işin ne zaman biteceğini tahminler.
*   Tarihsel günlük throughput verisinden rastgele örnekleme (Bootstrap yöntemi) ile 10.000 simülasyon koşar.
*   %50, %85, %90 güven aralıkları ile sonuç üretir.

### F. Raporlama ve Dışa Aktarım
*   Grafiklerin SVG ve PNG olarak indirilmesi.
*   İşlenmiş verilerin (CFD tablosu, Cycle Time listesi) CSV ve Excel formatında indirilmesi.

## 6. Kullanıcı Senaryoları ve Akış Diyagramları
### Senaryo 1: Sağlık Kontrolü (Health Check)
1.  **Kullanıcı:** Proje yöneticisi, takımın son 3 aydaki performansını merak eder.
2.  **Aksiyon:** Excel dosyasını yükler. Tarih kolonunu ve "Analiz", "Geliştirme", "Test", "Canlı" kolonlarını seçer.
3.  **Sonuç:** CFD grafiği çizilir. Sistem, "Test" aşamasında bir darboğaz olduğunu (artan dikey genişlik) ve WIP'in (Work In Progress) son ayda %20 arttığını "Analiz Özeti" kutusunda uyarı olarak gösterir.

### Senaryo 2: Teslimat Tahmini (Forecasting)
1.  **Kullanıcı:** Product Owner, "Backlog'daki 50 iş ne zaman biter?" sorusuna cevap arar.
2.  **Aksiyon:** "Monte Carlo" sekmesine geçer. Simülasyon tipini "Ne Zaman Biter?" seçer. Hedef PBI sayısını 50 girer.
3.  **Sonuç:** Simülasyon çalışır. Sistem: "50 işin bitmesi için %85 olasılıkla 42 gün gereklidir (Tahmini Tarih: 15 Mart)" sonucunu histogram grafiği ile gösterir.

## 7. Veritabanı Şeması
Bu proje **serverless** ve **database-less** bir mimariye sahiptir. Tüm veriler kullanıcının yüklediği Excel dosyasından anlık olarak okunur ve React state'inde (RAM) tutulur. Sayfa yenilendiğinde veriler sıfırlanır. Kalıcı bir veritabanı şeması yoktur.

## 8. API Spesifikasyonları
Proje herhangi bir dış API kullanmaz ve dışarıya API sunmaz. Tüm işlemler istemci tarafında (Client-Side) gerçekleşir.

## 9. Kurulum ve Dağıtım Talimatları
### Gereksinimler
*   Node.js (v18 veya üzeri)
*   npm veya pnpm

### Kurulum Adımları
1.  Projeyi klonlayın:
    ```bash
    git clone https://github.com/sadikalgul/kanban-suite.git
    cd kanban-suite
    ```
2.  Bağımlılıkları yükleyin:
    ```bash
    npm install
    ```
3.  Geliştirme sunucusunu başlatın:
    ```bash
    npm run dev
    ```
    Uygulama `http://localhost:5173` adresinde çalışacaktır.

### Canlıya Alma (Build & Deploy)
Uygulamayı statik dosyalara derlemek için:
```bash
npm run build
```
Oluşan `dist` klasörü herhangi bir statik hosting servisine (Netlify, Vercel, Apache/Nginx server) yüklenebilir.

## 10. Test Stratejisi ve Metodolojisi
Mevcut durumda proje manuel testlere dayanmaktadır, ancak önerilen test stratejisi şöyledir:

*   **Unit Testler:** Özellikle `runMonteCarloSimulation` ve `analyzeCFD` gibi matematiksel yoğunluklu fonksiyonlar için Jest/Vitest kullanılmalıdır. (Girdi: Throughput array -> Çıktı: p85 değeri doğruluğu).
*   **Entegrasyon Testleri:** Excel dosya okuma ve parse etme mantığının doğrulanması.
*   **E2E Testleri:** Cypress veya Playwright ile dosya yükleme, konfigürasyon seçimi ve grafiğin ekrana gelme akışının test edilmesi.

## 11. Proje Sürüm Geçmişi
*   **v1.0.0 (Mevcut):**
    *   Temel Excel yükleme ve parsing.
    *   Dinamik CFD oluşturma.
    *   Cycle Time ve Throughput hesaplamaları.
    *   Monte Carlo Simülasyonu (How Many / When).
    *   Görsel ve Veri dışa aktarım (Export) özellikleri.
