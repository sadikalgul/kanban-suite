import React, { useState, useRef, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Upload, BarChart3, Table, ChevronRight, GripVertical, Calendar, Layers, Download, Maximize2, X, TrendingUp, Play, RefreshCw, Target, Clock } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, LineChart, Line, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';

// ================== MONTE CARLO ENGINE ==================
const runMonteCarloSimulation = (throughputData, targetValue, simulationType, iterations = 10000) => {
  const results = [];
  const dailyThroughputs = throughputData.map(d => d.throughput);
  
  if (dailyThroughputs.length === 0) return null;
  
  for (let i = 0; i < iterations; i++) {
    if (simulationType === 'howMany') {
      let total = 0;
      for (let day = 0; day < targetValue; day++) {
        const randomIndex = Math.floor(Math.random() * dailyThroughputs.length);
        total += dailyThroughputs[randomIndex];
      }
      results.push(total);
    } else {
      let total = 0;
      let days = 0;
      while (total < targetValue) {
        const randomIndex = Math.floor(Math.random() * dailyThroughputs.length);
        total += dailyThroughputs[randomIndex];
        days++;
        if (days > 365) break;
      }
      results.push(days);
    }
  }
  
  results.sort((a, b) => a - b);
  
  const p50 = results[Math.floor(iterations * 0.5)];
  const p85 = results[Math.floor(iterations * 0.85)];
  const p90 = results[Math.floor(iterations * 0.9)];
  
  const min = results[0];
  const max = results[results.length - 1];
  const bucketSize = Math.ceil((max - min) / 25) || 1;
  
  const histogram = [];
  for (let i = min; i <= max; i += bucketSize) {
    const count = results.filter(r => r >= i && r < i + bucketSize).length;
    histogram.push({
      range: i,
      rangeLabel: `${i}`,
      count,
      percentage: (count / iterations * 100).toFixed(1)
    });
  }
  
  return { p50, p85, p90, min, max, histogram, results };
};

export default function KanbanAnalyticsSuite() {
  // ================== SHARED STATE ==================
  const [step, setStep] = useState(1);
  const [excelData, setExcelData] = useState(null);
  const [columns, setColumns] = useState([]);
  const [config, setConfig] = useState({
    dateColumn: '',
    stationColumns: [],
    pbiIdColumn: '',
    pbiNameColumn: '',
    cycleTimeStart: '',
    cycleTimeEnd: ''
  });
  
  // ================== CFD STATE ==================
  const [cfdData, setCfdData] = useState([]);
  const [dailyTable, setDailyTable] = useState([]);
  const [cycleTimeData, setCycleTimeData] = useState([]);
  const [throughputData, setThroughputData] = useState([]);
  const [movingAvgPeriod, setMovingAvgPeriod] = useState(3);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isFullScreenCycleTime, setIsFullScreenCycleTime] = useState(false);
  const [isFullScreenThroughput, setIsFullScreenThroughput] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const chartRef = useRef(null);
  const fullScreenChartRef = useRef(null);
  
  // ================== MONTE CARLO STATE ==================
  const [simulationType, setSimulationType] = useState('howMany');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [targetPBI, setTargetPBI] = useState(20);
  const [simulationResult, setSimulationResult] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [activeTab, setActiveTab] = useState('cfd'); // 'cfd' or 'montecarlo'
  const [mcDataRange, setMcDataRange] = useState(6); // Monte Carlo veri aralığı (ay)
  const [showThroughputTable, setShowThroughputTable] = useState(false);

  const colors = ['#E53935', '#1E88E5', '#43A047', '#FB8C00', '#8E24AA', '#00ACC1', '#FFD600', '#6D4C41', '#EC407A', '#3949AB'];

  // ================== FILE UPLOAD ==================
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws, { raw: false, dateNF: 'yyyy-mm-dd', defval: '' });
      if (data.length > 0) {
        const allColumns = new Set();
        data.forEach(row => { Object.keys(row).forEach(key => allColumns.add(key)); });
        setColumns([...allColumns]);
        setExcelData(data);
        setStep(2);
      }
    };
    reader.readAsBinaryString(file);
  };

  // ================== DATE UTILITIES ==================
  const parseDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    const str = String(value).trim();
    if (!str) return null;
    let date = new Date(str);
    if (!isNaN(date.getTime())) return date;
    const parts = str.split(/[.\/\-]/);
    if (parts.length === 3) {
      const [p1, p2, p3] = parts.map(p => parseInt(p, 10));
      if (p1 >= 1 && p1 <= 31 && p2 >= 1 && p2 <= 12) {
        date = new Date(p3, p2 - 1, p1);
        if (!isNaN(date.getTime())) return date;
      }
      if (p1 > 1900) {
        date = new Date(p1, p2 - 1, p3);
        if (!isNaN(date.getTime())) return date;
      }
    }
    return null;
  };

  const formatDate = (date) => {
    const d = new Date(date);
    return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
  };

  const formatDateISO = (date) => {
    const d = new Date(date);
    return d.toISOString().split('T')[0];
  };

  const addDays = (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };

  // ================== COLUMN MANAGEMENT ==================
  const toggleStationColumn = (col) => {
    if (config.stationColumns.includes(col)) {
      setConfig({...config, stationColumns: config.stationColumns.filter(c => c !== col)});
    } else {
      setConfig({...config, stationColumns: [...config.stationColumns, col]});
    }
  };

  const moveStationColumn = (index, direction) => {
    const newCols = [...config.stationColumns];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= newCols.length) return;
    [newCols[index], newCols[newIndex]] = [newCols[newIndex], newCols[index]];
    setConfig({...config, stationColumns: newCols});
  };

  // ================== CFD ANALYSIS ==================
  const analyzeCFD = (data, stations) => {
    if (!data || data.length < 2 || stations.length < 2) return null;
    const firstDay = data[0];
    const lastDay = data[data.length - 1];
    const midIndex = Math.floor(data.length / 2);
    
    const stationAnalysis = stations.map((station, idx) => {
      const values = data.map(d => d[station] || 0);
      const firstVal = values[0];
      const lastVal = values[values.length - 1];
      const maxVal = Math.max(...values);
      const minVal = Math.min(...values);
      const avgVal = values.reduce((a, b) => a + b, 0) / values.length;
      const firstHalf = values.slice(0, midIndex);
      const secondHalf = values.slice(midIndex);
      const firstHalfAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondHalfAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      const trend = secondHalfAvg - firstHalfAvg;
      const trendPercent = firstHalfAvg > 0 ? ((trend / firstHalfAvg) * 100).toFixed(1) : 0;
      const variance = values.reduce((sum, val) => sum + Math.pow(val - avgVal, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);
      return { station, firstVal, lastVal, maxVal, minVal, avgVal: avgVal.toFixed(1), trend, trendPercent, stdDev: stdDev.toFixed(1), change: lastVal - firstVal };
    });

    const middleStations = stationAnalysis.slice(1, -1);
    const bottlenecks = middleStations.filter(s => parseFloat(s.avgVal) > 0).sort((a, b) => parseFloat(b.avgVal) - parseFloat(a.avgVal)).slice(0, 2);
    const risingWIP = stationAnalysis.slice(0, -1).filter(s => s.trend > 2);
    const lastStation = stationAnalysis[stationAnalysis.length - 1];
    const throughputRate = lastStation ? (lastStation.lastVal / data.length).toFixed(2) : 0;
    const lastDayWIP = middleStations.reduce((sum, s) => sum + (lastDay[s.station] || 0), 0);
    const firstDayWIP = middleStations.reduce((sum, s) => sum + (firstDay[s.station] || 0), 0);
    const wipChange = lastDayWIP - firstDayWIP;

    const actions = [];
    if (bottlenecks.length > 0 && parseFloat(bottlenecks[0].avgVal) > 5) {
      actions.push({ type: 'warning', title: 'Darboğaz Tespit Edildi', desc: `"${bottlenecks[0].station}" istasyonunda ortalama ${bottlenecks[0].avgVal} iş bekliyor.` });
    }
    if (risingWIP.length > 0) {
      actions.push({ type: 'alert', title: 'Artan WIP Trendi', desc: `${risingWIP.map(s => `"${s.station}"`).join(', ')} istasyonlarında iş birikimi artıyor.` });
    }
    if (wipChange > 10) {
      actions.push({ type: 'alert', title: 'Genel WIP Artışı', desc: `Toplam WIP ${firstDayWIP}'den ${lastDayWIP}'e yükseldi (+${wipChange}).` });
    } else if (wipChange < -5) {
      actions.push({ type: 'success', title: 'WIP Azalması', desc: `Toplam WIP ${Math.abs(wipChange)} azaldı.` });
    }
    if (parseFloat(throughputRate) > 0) {
      actions.push({ type: 'info', title: 'Throughput', desc: `Günlük ortalama ${throughputRate} iş tamamlanıyor.` });
    }
    if (lastStation && lastStation.trend > 5) {
      actions.push({ type: 'success', title: 'Artan Teslimat', desc: `Tamamlanan iş sayısı artış trendinde.` });
    }
    const highVolatility = stationAnalysis.slice(0, -1).filter(s => parseFloat(s.stdDev) > parseFloat(s.avgVal) * 0.5);
    if (highVolatility.length > 0) {
      actions.push({ type: 'warning', title: 'Yüksek Dalgalanma', desc: `${highVolatility.map(s => `"${s.station}"`).join(', ')} istasyonlarında yüksek dalgalanma var.` });
    }
    if (actions.length === 0) {
      actions.push({ type: 'success', title: 'Stabil Süreç', desc: 'Belirgin bir sorun tespit edilmedi.' });
    }
    return { stationAnalysis, bottlenecks, actions, firstDayWIP, lastDayWIP, wipChange };
  };

  // ================== CYCLE TIME CALCULATION ==================
  const calcCycleTimeData = () => {
    if (!excelData || !config.pbiIdColumn || !config.cycleTimeStart || !config.cycleTimeEnd) return [];
    const results = [];
    excelData.forEach(row => {
      const pbiId = row[config.pbiIdColumn];
      const pbiName = config.pbiNameColumn ? row[config.pbiNameColumn] : '';
      const startDateVal = parseDate(row[config.cycleTimeStart]);
      const endDateVal = parseDate(row[config.cycleTimeEnd]);
      if (!endDateVal || !startDateVal || endDateVal < startDateVal) return;
      const diffTime = endDateVal.getTime() - startDateVal.getTime();
      const cycleTime = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
      results.push({ pbiId, pbiName, cycleTime, startDate: formatDate(startDateVal), endDate: formatDate(endDateVal) });
    });
    return results;
  };

  // ================== THROUGHPUT CALCULATION (MONTHLY) ==================
  const calcThroughputData = () => {
    if (!excelData || !config.cycleTimeEnd) return [];
    
    const monthlyData = {};
    const monthNames = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
    
    excelData.forEach(row => {
      const endDateVal = parseDate(row[config.cycleTimeEnd]);
      if (!endDateVal) return;
      
      const year = endDateVal.getFullYear();
      const month = endDateVal.getMonth();
      const key = `${year}-${String(month + 1).padStart(2, '0')}`;
      const label = `${monthNames[month]} ${year}`;
      
      if (!monthlyData[key]) {
        monthlyData[key] = { key, label, count: 0, year, month };
      }
      monthlyData[key].count++;
    });
    
    return Object.values(monthlyData).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
  };

  // ================== DAILY THROUGHPUT FOR MONTE CARLO ==================
  const dailyThroughputForMC = useMemo(() => {
    if (!excelData || !config.cycleTimeEnd) return [];
    
    const now = new Date();
    const monthsAgo = new Date(now);
    monthsAgo.setMonth(monthsAgo.getMonth() - mcDataRange);
    
    // Tamamlanma tarihlerine göre günlük throughput hesapla
    const completionDates = excelData
      .map(row => parseDate(row[config.cycleTimeEnd]))
      .filter(date => date && date >= monthsAgo && date <= now)
      .sort((a, b) => a - b);
    
    if (completionDates.length === 0) return [];
    
    // Tarih aralığındaki her gün için map oluştur
    const dailyMap = {};
    const minDate = completionDates[0];
    const maxDate = completionDates[completionDates.length - 1];
    
    for (let d = new Date(minDate); d <= maxDate; d.setDate(d.getDate() + 1)) {
      const key = formatDate(d);
      dailyMap[key] = 0;
    }
    
    // Her tamamlanma tarihini say
    completionDates.forEach(date => {
      const key = formatDate(date);
      dailyMap[key] = (dailyMap[key] || 0) + 1;
    });
    
    // Array'e dönüştür
    return Object.entries(dailyMap).map(([date, throughput]) => ({
      date,
      throughput
    }));
  }, [excelData, config.cycleTimeEnd, mcDataRange]);

  // ================== MOVING AVERAGE ==================
  const calcMovingAverage = (data, period) => {
    return data.map((item, index) => {
      if (index < period - 1) {
        return { ...item, movingAvg: null };
      }
      const sum = data.slice(index - period + 1, index + 1).reduce((s, d) => s + d.count, 0);
      return { ...item, movingAvg: parseFloat((sum / period).toFixed(1)) };
    });
  };

  const throughputWithMA = calcMovingAverage(throughputData, movingAvgPeriod);

  // ================== CALCULATE CFD ==================
  const calculateCFD = () => {
    if (!excelData || !config.dateColumn || config.stationColumns.length === 0) {
      alert('Lütfen tarih kolonu ve en az 2 istasyon kolonu seçin!');
      return;
    }
    const mainDates = excelData.map(row => parseDate(row[config.dateColumn])).filter(d => d !== null);
    if (mainDates.length === 0) {
      alert('Seçilen tarih kolonunda geçerli tarih bulunamadı!');
      return;
    }
    const minDate = new Date(Math.min(...mainDates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...mainDates.map(d => d.getTime())));
    const dateRange = [];
    const currentDate = new Date(minDate);
    while (currentDate <= maxDate) {
      dateRange.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    const result = dateRange.map(targetDate => {
      const dateStr = formatDate(targetDate);
      const dayData = { date: dateStr };
      config.stationColumns.forEach(col => { dayData[col] = 0; });
      excelData.forEach(row => {
        let latestDate = null;
        let latestStation = null;
        config.stationColumns.forEach(col => {
          const colDate = parseDate(row[col]);
          if (colDate && colDate <= targetDate) {
            if (!latestDate || colDate >= latestDate) {
              latestDate = colDate;
              latestStation = col;
            }
          }
        });
        if (latestStation) dayData[latestStation]++;
      });
      dayData.total = config.stationColumns.reduce((sum, col) => sum + (dayData[col] || 0), 0);
      return dayData;
    });
    setDailyTable(result);
    setCfdData(result);
    setCycleTimeData(calcCycleTimeData());
    setThroughputData(calcThroughputData());
    setAnalysis(analyzeCFD(result, config.stationColumns));
    
    // Set default dates for Monte Carlo
    const today = new Date();
    const nextMonth = new Date(today);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    setStartDate(formatDateISO(today));
    setEndDate(formatDateISO(nextMonth));
    
    setStep(3);
  };

  // ================== RUN MONTE CARLO ==================
  const runSimulation = useCallback(() => {
    if (dailyThroughputForMC.length === 0) {
      alert('Throughput verisi bulunamadı! Lütfen "End İstasyonu" (Cycle Time ayarlarında) seçildiğinden emin olun.');
      return;
    }
    
    setIsSimulating(true);
    
    setTimeout(() => {
      let target;
      if (simulationType === 'howMany') {
        const start = new Date(startDate);
        const end = new Date(endDate);
        target = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
      } else {
        target = targetPBI;
      }
      
      const result = runMonteCarloSimulation(dailyThroughputForMC, target, simulationType);
      setSimulationResult(result);
      setIsSimulating(false);
    }, 100);
  }, [dailyThroughputForMC, simulationType, startDate, endDate, targetPBI]);

  // ================== HISTOGRAM BAR COLORS ==================
  const getBarColor = (index, data) => {
    if (!simulationResult) return '#64748b';
    const value = data[index].range;
    if (value <= simulationResult.p50) return '#06b6d4';
    if (value <= simulationResult.p85) return '#22c55e';
    if (value <= simulationResult.p90) return '#f59e0b';
    return '#ef4444';
  };

  // ================== DOWNLOAD FUNCTIONS ==================
  const downloadTableAsCSV = () => {
    const headers = ['Tarih', ...config.stationColumns, 'Toplam'];
    const csvContent = [headers.join(';'), ...dailyTable.map(row => [row.date, ...config.stationColumns.map(col => row[col] || 0), row.total || 0].join(';'))].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cfd_tablo.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadTableAsExcel = () => {
    const wsData = [['Tarih', ...config.stationColumns, 'Toplam'], ...dailyTable.map(row => [row.date, ...config.stationColumns.map(col => row[col] || 0), row.total || 0])];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'CFD Data');
    XLSX.writeFile(wb, 'cfd_tablo.xlsx');
  };

  const createSvgWithLegend = () => {
    const activeRef = isFullScreen ? fullScreenChartRef : chartRef;
    if (!activeRef.current) return null;
    const svgElement = activeRef.current.querySelector('.recharts-wrapper svg');
    if (!svgElement) return null;
    const svgRect = svgElement.getBoundingClientRect();
    const legendHeight = 60;
    const newSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    newSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    newSvg.setAttribute('width', svgRect.width);
    newSvg.setAttribute('height', svgRect.height + legendHeight);
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '100%');
    bg.setAttribute('height', '100%');
    bg.setAttribute('fill', 'white');
    newSvg.appendChild(bg);
    const chartGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    chartGroup.innerHTML = svgElement.innerHTML;
    newSvg.appendChild(chartGroup);
    const legendGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    legendGroup.setAttribute('transform', `translate(20, ${svgRect.height - 40})`);
    const itemWidth = 120;
    const itemsPerRow = Math.floor((svgRect.width - 40) / itemWidth);
    config.stationColumns.forEach((col, index) => {
      const row = Math.floor(index / itemsPerRow);
      const colIndex = index % itemsPerRow;
      const x = colIndex * itemWidth;
      const y = row * 25;
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', x);
      rect.setAttribute('y', y);
      rect.setAttribute('width', '14');
      rect.setAttribute('height', '14');
      rect.setAttribute('fill', colors[index % colors.length]);
      legendGroup.appendChild(rect);
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', x + 20);
      text.setAttribute('y', y + 11);
      text.setAttribute('font-size', '12');
      text.setAttribute('fill', '#333');
      text.textContent = col.length > 12 ? col.substring(0, 12) + '...' : col;
      legendGroup.appendChild(text);
    });
    newSvg.appendChild(legendGroup);
    return newSvg;
  };

  const downloadChartAsSVG = () => {
    const svgWithLegend = createSvgWithLegend();
    if (!svgWithLegend) { alert('Grafik bulunamadı!'); return; }
    const svgData = new XMLSerializer().serializeToString(svgWithLegend);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cfd_chart.svg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadChartAsPNG = () => {
    const svgWithLegend = createSvgWithLegend();
    if (!svgWithLegend) { alert('Grafik bulunamadı!'); return; }
    const width = parseFloat(svgWithLegend.getAttribute('width'));
    const height = parseFloat(svgWithLegend.getAttribute('height'));
    const svgData = new XMLSerializer().serializeToString(svgWithLegend);
    const svgBase64 = btoa(unescape(encodeURIComponent(svgData)));
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = width * 2;
      canvas.height = height * 2;
      ctx.scale(2, 2);
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'cfd_chart.png';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }, 'image/png');
    };
    img.src = 'data:image/svg+xml;base64,' + svgBase64;
  };

  // ================== RESET ==================
  const resetAll = () => {
    setStep(1);
    setExcelData(null);
    setCfdData([]);
    setDailyTable([]);
    setCycleTimeData([]);
    setThroughputData([]);
    setIsFullScreen(false);
    setIsFullScreenCycleTime(false);
    setIsFullScreenThroughput(false);
    setMovingAvgPeriod(3);
    setAnalysis(null);
    setSimulationResult(null);
    setActiveTab('cfd');
    setMcDataRange(6);
    setShowThroughputTable(false);
    setConfig({ dateColumn: '', stationColumns: [], pbiIdColumn: '', pbiNameColumn: '', cycleTimeStart: '', cycleTimeEnd: '' });
  };

  // ================== RENDER ==================
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white mb-1 flex items-center justify-center gap-3">
            <TrendingUp className="text-cyan-400" size={28} />
            Kanban Analytics Suite
            <Layers className="text-green-400" size={28} />
          </h1>
          <p className="text-slate-400 text-sm">Monte Carlo Simülasyonu + CFD Analizi • Designed By Sadık Algul</p>
        </div>
        
        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {[1, 2, 3].map((s) => (
            <React.Fragment key={s}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${step >= s ? 'bg-cyan-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
                {s}
              </div>
              {s < 3 && <ChevronRight className="text-slate-600" size={16} />}
            </React.Fragment>
          ))}
        </div>

        {/* Step 1: File Upload */}
        {step === 1 && (
          <div className="bg-slate-800/50 backdrop-blur rounded-2xl shadow-xl p-8 border border-slate-700/50">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-white">
              <Upload className="text-cyan-400" /> Excel Dosyası Yükle
            </h2>
            <label className="block border-2 border-dashed border-cyan-500/30 rounded-xl p-12 text-center cursor-pointer hover:border-cyan-500/60 hover:bg-cyan-500/5 transition-all">
              <Upload className="mx-auto text-cyan-400/60 mb-3" size={48} />
              <p className="text-slate-300">Excel dosyanızı sürükleyin veya tıklayın</p>
              <p className="text-slate-500 text-sm mt-1">.xlsx, .xls</p>
              <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        )}

        {/* Step 2: Configuration */}
        {step === 2 && (
          <div className="bg-slate-800/50 backdrop-blur rounded-2xl shadow-xl p-6 border border-slate-700/50">
            <h2 className="text-lg font-semibold mb-4 text-white">Kolon Seçimi</h2>
            
            {/* Date Column */}
            <div className="mb-4 p-4 border border-cyan-500/30 rounded-xl bg-cyan-500/5">
              <label className="flex items-center gap-2 text-sm font-medium text-cyan-300 mb-2">
                <Calendar size={16} /> Tarih Kolonu
              </label>
              <select 
                className="w-full p-2 border border-slate-600 rounded-lg text-sm bg-slate-700 text-white"
                value={config.dateColumn} 
                onChange={(e) => setConfig({...config, dateColumn: e.target.value})}
              >
                <option value="">Seçiniz...</option>
                {columns.map(col => <option key={col} value={col}>{col}</option>)}
              </select>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
                <div>
                  <label className="text-xs text-cyan-200">PBI ID Kolonu</label>
                  <select className="w-full p-2 border border-slate-600 rounded text-xs bg-slate-700 text-white" value={config.pbiIdColumn} onChange={(e) => setConfig({...config, pbiIdColumn: e.target.value})}>
                    <option value="">Seçiniz...</option>
                    {columns.map(col => <option key={col} value={col}>{col}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-cyan-200">PBI Adı Kolonu</label>
                  <select className="w-full p-2 border border-slate-600 rounded text-xs bg-slate-700 text-white" value={config.pbiNameColumn} onChange={(e) => setConfig({...config, pbiNameColumn: e.target.value})}>
                    <option value="">Seçiniz...</option>
                    {columns.map(col => <option key={col} value={col}>{col}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Station Columns */}
            <div className="mb-4 p-4 border border-green-500/30 rounded-xl bg-green-500/5">
              <label className="flex items-center gap-2 text-sm font-medium text-green-300 mb-2">
                <Layers size={16} /> İstasyon Kolonları (akış sırasına göre seçin)
              </label>
              <div className="border border-slate-600 rounded-lg p-2 max-h-40 overflow-y-auto bg-slate-700/50">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
                  {columns.map(col => (
                    <label key={col} className={`flex items-center gap-1 p-2 rounded text-xs cursor-pointer transition-all ${config.stationColumns.includes(col) ? 'bg-green-500/20 border border-green-500/50 text-green-300' : 'bg-slate-600/50 hover:bg-slate-600 text-slate-300'}`}>
                      <input type="checkbox" checked={config.stationColumns.includes(col)} onChange={() => toggleStationColumn(col)} className="w-3 h-3" />
                      <span className="truncate">{col}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Selected Stations Order */}
            {config.stationColumns.length > 0 && (
              <div className="mb-4 p-4 bg-amber-500/5 border border-amber-500/30 rounded-xl">
                <p className="text-xs font-medium text-amber-300 mb-2">Seçilen İstasyonlar (sürükleyerek sıralayın):</p>
                <div className="space-y-1">
                  {config.stationColumns.map((col, idx) => (
                    <div key={col} className="flex items-center gap-2 bg-slate-700/50 p-2 rounded border border-slate-600 text-xs">
                      <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs text-white font-bold" style={{backgroundColor: colors[idx % colors.length]}}>{idx + 1}</span>
                      <span className="flex-1 text-white">{col}</span>
                      <button onClick={() => moveStationColumn(idx, -1)} disabled={idx === 0} className="px-2 py-1 bg-slate-600 rounded disabled:opacity-30 text-white">↑</button>
                      <button onClick={() => moveStationColumn(idx, 1)} disabled={idx === config.stationColumns.length - 1} className="px-2 py-1 bg-slate-600 rounded disabled:opacity-30 text-white">↓</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cycle Time Settings */}
            <div className="mb-4 p-4 border border-purple-500/30 rounded-xl bg-purple-500/5">
              <label className="text-sm font-medium text-purple-300 mb-2 block">⏱️ Cycle Time Ayarları (Opsiyonel)</label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-purple-200">Start İstasyonu</label>
                  <select className="w-full p-2 border border-slate-600 rounded text-xs bg-slate-700 text-white" value={config.cycleTimeStart} onChange={(e) => setConfig({...config, cycleTimeStart: e.target.value})}>
                    <option value="">Seçiniz...</option>
                    {config.stationColumns.map(col => <option key={col} value={col}>{col}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-purple-200">End İstasyonu</label>
                  <select className="w-full p-2 border border-slate-600 rounded text-xs bg-slate-700 text-white" value={config.cycleTimeEnd} onChange={(e) => setConfig({...config, cycleTimeEnd: e.target.value})}>
                    <option value="">Seçiniz...</option>
                    {config.stationColumns.map(col => <option key={col} value={col}>{col}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="px-4 py-2 bg-slate-600 text-white rounded-lg text-sm hover:bg-slate-500 transition-all">Geri</button>
              <button onClick={calculateCFD} disabled={!config.dateColumn || config.stationColumns.length < 2} className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-green-500 text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:from-cyan-400 hover:to-green-400 transition-all">
                <Play size={16} className="inline mr-1" /> Hesapla
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Results */}
        {step === 3 && (
          <div className="space-y-4">
            
            {/* Tab Switcher */}
            <div className="flex justify-center mb-4">
              <div className="bg-slate-800/80 rounded-xl p-1 flex gap-1">
                <button 
                  onClick={() => setActiveTab('cfd')}
                  className={`px-6 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'cfd' ? 'bg-green-500 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  <Layers size={16} /> CFD Analizi
                </button>
                <button 
                  onClick={() => setActiveTab('montecarlo')}
                  className={`px-6 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'montecarlo' ? 'bg-cyan-500 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  <TrendingUp size={16} /> Monte Carlo
                </button>
              </div>
            </div>

            {/* MONTE CARLO TAB */}
            {activeTab === 'montecarlo' && (
              <div className="space-y-4">
                {/* Warning if no End Station selected */}
                {!config.cycleTimeEnd && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
                    <div className="text-amber-400 text-xl">⚠️</div>
                    <div>
                      <h3 className="text-amber-300 font-semibold">End İstasyonu Seçilmedi</h3>
                      <p className="text-slate-400 text-sm mt-1">
                        Monte Carlo simülasyonu için throughput verisi gereklidir. 
                        Lütfen <strong>"Yeni Analiz Başlat"</strong> butonuna tıklayıp, 
                        Cycle Time ayarlarından <strong>"End İstasyonu"</strong> (tamamlanan işlerin istasyonu) seçin.
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Left: Inputs */}
                  <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-5 border border-cyan-500/30">
                    <h2 className="text-lg font-semibold text-cyan-400 mb-4 flex items-center gap-2">
                      <TrendingUp size={20} /> Monte Carlo Simülasyonu
                    </h2>
                    
                    {/* Data Range Selection */}
                    <div className="mb-4">
                      <label className="text-slate-400 text-xs block mb-2">Veri Aralığı (Throughput Hesabı İçin)</label>
                      <div className="grid grid-cols-4 gap-2">
                        {[3, 6, 9, 12].map(months => (
                          <button
                            key={months}
                            onClick={() => setMcDataRange(months)}
                            className={`p-2 rounded-lg text-sm font-medium transition-all ${mcDataRange === months ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                          >
                            Son {months} Ay
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    {/* Throughput Summary */}
                    <div className="bg-cyan-500/10 rounded-xl p-4 mb-4">
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div>
                          <div className="text-slate-400 text-xs">Veri Noktası</div>
                          <div className="text-cyan-400 text-2xl font-bold">{dailyThroughputForMC.length}</div>
                          <div className="text-slate-500 text-xs">gün</div>
                        </div>
                        <div>
                          <div className="text-slate-400 text-xs">Ort. Throughput</div>
                          <div className="text-green-400 text-2xl font-bold">
                            {dailyThroughputForMC.length > 0 
                              ? (dailyThroughputForMC.reduce((a, b) => a + b.throughput, 0) / dailyThroughputForMC.length).toFixed(2)
                              : '0'}
                          </div>
                          <div className="text-slate-500 text-xs">PBI/gün</div>
                        </div>
                        <div>
                          <div className="text-slate-400 text-xs">Toplam Tamamlanan</div>
                          <div className="text-amber-400 text-2xl font-bold">
                            {dailyThroughputForMC.reduce((a, b) => a + b.throughput, 0)}
                          </div>
                          <div className="text-slate-500 text-xs">PBI</div>
                        </div>
                      </div>
                    </div>

                    {/* Simulation Type */}
                    <div className="mb-4">
                      <label className="text-slate-400 text-xs block mb-2">Simülasyon Tipi</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setSimulationType('howMany')}
                          className={`p-3 rounded-lg text-sm font-medium transition-all ${simulationType === 'howMany' ? 'bg-gradient-to-r from-cyan-500 to-cyan-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                        >
                          📊 Ne Kadar İş?
                        </button>
                        <button
                          onClick={() => setSimulationType('whenDone')}
                          className={`p-3 rounded-lg text-sm font-medium transition-all ${simulationType === 'whenDone' ? 'bg-gradient-to-r from-green-500 to-green-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                        >
                          📅 Ne Zaman Biter?
                        </button>
                      </div>
                    </div>

                    {/* Inputs */}
                    {simulationType === 'howMany' ? (
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div>
                          <label className="text-slate-400 text-xs block mb-1">Başlangıç Tarihi</label>
                          <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full p-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-slate-400 text-xs block mb-1">Bitiş Tarihi</label>
                          <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full p-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3 mb-4">
                        <div>
                          <label className="text-slate-400 text-xs block mb-1">Hedef PBI Sayısı</label>
                          <input
                            type="number"
                            value={targetPBI}
                            onChange={(e) => setTargetPBI(Number(e.target.value))}
                            min={1}
                            className="w-full p-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-slate-400 text-xs block mb-1">Başlangıç Tarihi</label>
                          <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full p-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm"
                          />
                        </div>
                      </div>
                    )}

                    {/* Run Button */}
                    <button
                      onClick={runSimulation}
                      disabled={isSimulating || dailyThroughputForMC.length === 0}
                      className="w-full py-3 bg-gradient-to-r from-cyan-500 to-cyan-600 text-white rounded-xl font-semibold disabled:opacity-50 hover:from-cyan-400 hover:to-cyan-500 transition-all flex items-center justify-center gap-2"
                    >
                      {isSimulating ? (
                        <><RefreshCw size={18} className="animate-spin" /> Simülasyon Çalışıyor...</>
                      ) : (
                        <><Play size={18} /> Simülasyonu Çalıştır (10.000 iterasyon)</>
                      )}
                    </button>
                  </div>

                  {/* Right: Results */}
                  <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-5 border border-cyan-500/30">
                    {simulationResult ? (
                      <>
                        {/* Probability Cards */}
                        <div className="grid grid-cols-3 gap-2 mb-4">
                          <div className="bg-cyan-500/20 rounded-xl p-3 text-center">
                            <div className="text-slate-400 text-xs">%50 Olasılık</div>
                            <div className="text-cyan-400 text-2xl font-bold">{simulationResult.p50}</div>
                            <div className="text-slate-500 text-xs">{simulationType === 'howMany' ? 'PBI' : 'Gün'}</div>
                          </div>
                          <div className="bg-green-500/20 rounded-xl p-3 text-center">
                            <div className="text-slate-400 text-xs">%85 Olasılık</div>
                            <div className="text-green-400 text-2xl font-bold">{simulationResult.p85}</div>
                            <div className="text-slate-500 text-xs">{simulationType === 'howMany' ? 'PBI' : 'Gün'}</div>
                          </div>
                          <div className="bg-amber-500/20 rounded-xl p-3 text-center">
                            <div className="text-slate-400 text-xs">%90 Olasılık</div>
                            <div className="text-amber-400 text-2xl font-bold">{simulationResult.p90}</div>
                            <div className="text-slate-500 text-xs">{simulationType === 'howMany' ? 'PBI' : 'Gün'}</div>
                          </div>
                        </div>

                        {/* Histogram */}
                        <div className="h-64 mb-4">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={simulationResult.histogram}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                              <XAxis dataKey="rangeLabel" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                              <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                              <Tooltip
                                contentStyle={{ background: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
                                labelStyle={{ color: '#f8fafc' }}
                              />
                              <ReferenceLine x={simulationResult.p50.toString()} stroke="#06b6d4" strokeWidth={2} strokeDasharray="5 5" />
                              <ReferenceLine x={simulationResult.p85.toString()} stroke="#22c55e" strokeWidth={2} strokeDasharray="5 5" />
                              <ReferenceLine x={simulationResult.p90.toString()} stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" />
                              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                {simulationResult.histogram.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={getBarColor(index, simulationResult.histogram)} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>

                        {/* Interpretation */}
                        <div className="bg-green-500/10 border-l-4 border-green-500 rounded-r-xl p-4">
                          <div className="text-green-400 text-sm font-semibold mb-1">📌 Öneri: %85 değerini kullanın</div>
                          <p className="text-slate-300 text-xs leading-relaxed">
                            {simulationType === 'howMany' ? (
                              <>
                                <strong>{formatDate(new Date(startDate))} - {formatDate(new Date(endDate))}</strong> arasında takımın 
                                tamamlayabileceği PBI: En az <span className="text-cyan-400 font-semibold">{simulationResult.p50}</span> (%50), 
                                büyük olasılıkla <span className="text-green-400 font-semibold">{simulationResult.p85}</span> (%85).
                              </>
                            ) : (
                              <>
                                <strong>{targetPBI} PBI</strong> tamamlamak için: Optimistik <span className="text-cyan-400 font-semibold">{simulationResult.p50} gün</span> 
                                ({formatDate(addDays(new Date(startDate), simulationResult.p50))}), 
                                gerçekçi <span className="text-green-400 font-semibold">{simulationResult.p85} gün</span> 
                                ({formatDate(addDays(new Date(startDate), simulationResult.p85))}).
                              </>
                            )}
                          </p>
                        </div>
                      </>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center py-12">
                        <TrendingUp size={64} className="text-slate-600 mb-4" />
                        <h3 className="text-slate-400 text-lg font-medium mb-2">Simülasyon Sonuçları</h3>
                        <p className="text-slate-500 text-sm max-w-xs">
                          Sol paneldeki ayarları yaparak Monte Carlo simülasyonunu başlatın.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Throughput Table */}
                {dailyThroughputForMC.length > 0 && (
                  <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-4 border border-slate-700/50">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-lg font-semibold flex items-center gap-2 text-white">
                        <Table className="text-purple-400" /> Günlük Throughput Tablosu
                        <span className="text-slate-400 text-sm font-normal">({dailyThroughputForMC.length} gün, Son {mcDataRange} Ay)</span>
                      </h2>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setShowThroughputTable(!showThroughputTable)}
                          className="flex items-center gap-1 px-3 py-1 text-xs bg-slate-600 text-white rounded hover:bg-slate-500"
                        >
                          {showThroughputTable ? 'Tabloyu Gizle' : 'Tabloyu Göster'}
                        </button>
                        <button 
                          onClick={() => {
                            const csv = ['Tarih;Throughput (PBI)', ...dailyThroughputForMC.map(r => `${r.date};${r.throughput}`)].join('\n');
                            const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
                            const link = document.createElement('a');
                            link.href = URL.createObjectURL(blob);
                            link.download = 'daily_throughput.csv';
                            link.click();
                          }}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-500/20 text-blue-300 rounded hover:bg-blue-500/30"
                        >
                          <Download size={14} /> CSV
                        </button>
                      </div>
                    </div>
                    
                    {/* Summary Stats */}
                    <div className="grid grid-cols-5 gap-2 text-center text-xs mb-3">
                      <div className="bg-green-500/10 p-2 rounded">
                        <p className="text-slate-400">Min</p>
                        <p className="font-bold text-green-400">{Math.min(...dailyThroughputForMC.map(d => d.throughput))} PBI</p>
                      </div>
                      <div className="bg-red-500/10 p-2 rounded">
                        <p className="text-slate-400">Max</p>
                        <p className="font-bold text-red-400">{Math.max(...dailyThroughputForMC.map(d => d.throughput))} PBI</p>
                      </div>
                      <div className="bg-blue-500/10 p-2 rounded">
                        <p className="text-slate-400">Ortalama</p>
                        <p className="font-bold text-blue-400">{(dailyThroughputForMC.reduce((s, d) => s + d.throughput, 0) / dailyThroughputForMC.length).toFixed(2)} PBI</p>
                      </div>
                      <div className="bg-purple-500/10 p-2 rounded">
                        <p className="text-slate-400">Medyan</p>
                        <p className="font-bold text-purple-400">
                          {(() => { 
                            const sorted = [...dailyThroughputForMC].sort((a, b) => a.throughput - b.throughput); 
                            const mid = Math.floor(sorted.length / 2); 
                            return sorted.length % 2 ? sorted[mid].throughput : ((sorted[mid-1].throughput + sorted[mid].throughput) / 2).toFixed(1); 
                          })()} PBI
                        </p>
                      </div>
                      <div className="bg-amber-500/10 p-2 rounded">
                        <p className="text-slate-400">Toplam</p>
                        <p className="font-bold text-amber-400">{dailyThroughputForMC.reduce((s, d) => s + d.throughput, 0)} PBI</p>
                      </div>
                    </div>

                    {/* Throughput Chart */}
                    <div className="h-48 bg-slate-900/50 rounded-xl p-2 mb-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={dailyThroughputForMC} margin={{ top: 10, right: 10, left: 0, bottom: 30 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis 
                            dataKey="date" 
                            tick={{ fill: '#94a3b8', fontSize: 8 }} 
                            angle={-45} 
                            textAnchor="end"
                            height={50}
                            interval={Math.floor(dailyThroughputForMC.length / 15)}
                          />
                          <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                          <Tooltip 
                            contentStyle={{ background: '#1e293b', border: '1px solid #475569', borderRadius: '8px' }}
                            labelStyle={{ color: '#f8fafc' }}
                            formatter={(value) => [`${value} PBI`, 'Throughput']}
                          />
                          <Bar dataKey="throughput" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    
                    {/* Table */}
                    {showThroughputTable && (
                      <div className="overflow-auto max-h-64 border border-slate-700 rounded-lg text-xs">
                        <table className="w-full">
                          <thead className="bg-slate-700/50 sticky top-0">
                            <tr>
                              <th className="p-2 text-left text-slate-300 border-b border-slate-600">Tarih</th>
                              <th className="p-2 text-center text-slate-300 border-b border-slate-600">Throughput (PBI)</th>
                              <th className="p-2 text-left text-slate-300 border-b border-slate-600">Görsel</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dailyThroughputForMC.map((row, idx) => (
                              <tr key={idx} className={idx % 2 === 0 ? 'bg-slate-800/30' : 'bg-slate-700/30'}>
                                <td className="p-2 border-b border-slate-700 text-slate-300">{row.date}</td>
                                <td className="p-2 text-center border-b border-slate-700">
                                  <span className={`px-2 py-1 rounded ${row.throughput === 0 ? 'bg-slate-600 text-slate-400' : row.throughput <= 2 ? 'bg-blue-500/30 text-blue-300' : row.throughput <= 5 ? 'bg-green-500/30 text-green-300' : 'bg-amber-500/30 text-amber-300'}`}>
                                    {row.throughput}
                                  </span>
                                </td>
                                <td className="p-2 border-b border-slate-700">
                                  <div className="flex gap-0.5">
                                    {Array.from({ length: Math.min(row.throughput, 10) }).map((_, i) => (
                                      <div key={i} className="w-2 h-2 rounded-full bg-purple-400"></div>
                                    ))}
                                    {row.throughput > 10 && <span className="text-purple-300 text-xs ml-1">+{row.throughput - 10}</span>}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* CFD TAB */}
            {activeTab === 'cfd' && (
              <div className="space-y-4">
                {/* Daily Table */}
                <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-4 border border-slate-700/50">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-semibold flex items-center gap-2 text-white">
                      <Table className="text-blue-400" /> Günlük İş Sayıları
                    </h2>
                    <div className="flex gap-1">
                      <button onClick={downloadTableAsCSV} className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-500/20 text-blue-300 rounded hover:bg-blue-500/30">
                        <Download size={14} /> CSV
                      </button>
                      <button onClick={downloadTableAsExcel} className="flex items-center gap-1 px-2 py-1 text-xs bg-green-500/20 text-green-300 rounded hover:bg-green-500/30">
                        <Download size={14} /> Excel
                      </button>
                    </div>
                  </div>
                  <div className="overflow-auto max-h-48 border border-slate-700 rounded-lg text-xs">
                    <table className="w-full">
                      <thead className="bg-slate-700/50 sticky top-0">
                        <tr>
                          <th className="p-2 text-left text-slate-300 border-b border-slate-600">Tarih</th>
                          {config.stationColumns.map((col, i) => (
                            <th key={col} className="p-2 text-center border-b border-slate-600" style={{color: colors[i % colors.length]}}>{col}</th>
                          ))}
                          <th className="p-2 text-center border-b border-slate-600 bg-slate-600/50 text-white">Toplam</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dailyTable.map((row, idx) => (
                          <tr key={idx} className={idx % 2 === 0 ? 'bg-slate-800/30' : 'bg-slate-700/30'}>
                            <td className="p-2 border-b border-slate-700 text-slate-300">{row.date}</td>
                            {config.stationColumns.map(col => (
                              <td key={col} className="p-2 text-center border-b border-slate-700 text-slate-300">{row[col] || 0}</td>
                            ))}
                            <td className="p-2 text-center border-b border-slate-700 font-bold bg-slate-600/30 text-white">{row.total}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* CFD Chart */}
                <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-4 border border-slate-700/50">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-semibold flex items-center gap-2 text-white">
                      <BarChart3 className="text-green-400" /> Cumulative Flow Diagram
                    </h2>
                    <div className="flex gap-1">
                      <button onClick={() => setIsFullScreen(true)} className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-600 text-white rounded hover:bg-slate-500">
                        <Maximize2 size={14} /> Tam Ekran
                      </button>
                      <button onClick={downloadChartAsSVG} className="flex items-center gap-1 px-2 py-1 text-xs bg-purple-500/20 text-purple-300 rounded hover:bg-purple-500/30">
                        <Download size={14} /> SVG
                      </button>
                      <button onClick={downloadChartAsPNG} className="flex items-center gap-1 px-2 py-1 text-xs bg-orange-500/20 text-orange-300 rounded hover:bg-orange-500/30">
                        <Download size={14} /> PNG
                      </button>
                    </div>
                  </div>
                  <div className="h-80 bg-white rounded-xl p-2" ref={chartRef}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={cfdData} margin={{ top: 10, right: 30, left: 0, bottom: 50 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" angle={-45} textAnchor="end" height={70} tick={{fontSize: 10}} />
                        <YAxis tick={{fontSize: 10}} />
                        <Tooltip />
                        <Legend verticalAlign="top" payload={config.stationColumns.map((col, i) => ({ value: col, type: 'square', color: colors[i % colors.length] }))} />
                        {[...config.stationColumns].reverse().map((col) => {
                          const idx = config.stationColumns.indexOf(col);
                          return <Area key={col} type="monotone" dataKey={col} stackId="1" stroke={colors[idx % colors.length]} fill={colors[idx % colors.length]} />;
                        })}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* CFD Analysis */}
                {analysis && (
                  <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-4 border border-slate-700/50">
                    <h2 className="text-lg font-semibold mb-3 text-white">📊 CFD Analiz Özeti</h2>
                    <div className="space-y-2 mb-4">
                      {analysis.actions.map((a, i) => (
                        <div key={i} className={`p-3 rounded-lg border-l-4 ${a.type === 'warning' ? 'bg-yellow-500/10 border-yellow-500' : a.type === 'alert' ? 'bg-red-500/10 border-red-500' : a.type === 'success' ? 'bg-green-500/10 border-green-500' : 'bg-blue-500/10 border-blue-500'}`}>
                          <h4 className="font-semibold text-sm text-white">{a.type === 'warning' ? '⚠️' : a.type === 'alert' ? '🚨' : a.type === 'success' ? '✅' : 'ℹ️'} {a.title}</h4>
                          <p className="text-xs mt-1 text-slate-300">{a.desc}</p>
                        </div>
                      ))}
                    </div>
                    <div className="overflow-auto text-xs mb-3">
                      <table className="w-full">
                        <thead className="bg-slate-700/50">
                          <tr>
                            <th className="p-2 text-left text-slate-300">İstasyon</th>
                            <th className="p-2 text-center text-slate-300">Ort</th>
                            <th className="p-2 text-center text-slate-300">Min</th>
                            <th className="p-2 text-center text-slate-300">Max</th>
                            <th className="p-2 text-center text-slate-300">Değişim</th>
                            <th className="p-2 text-center text-slate-300">Trend</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analysis.stationAnalysis.map((s, i) => (
                            <tr key={i} className={i % 2 === 0 ? 'bg-slate-800/30' : 'bg-slate-700/30'}>
                              <td className="p-2" style={{color: colors[i % colors.length]}}>{s.station}</td>
                              <td className="p-2 text-center text-slate-300">{s.avgVal}</td>
                              <td className="p-2 text-center text-slate-300">{s.minVal}</td>
                              <td className="p-2 text-center text-slate-300">{s.maxVal}</td>
                              <td className="p-2 text-center">
                                <span className={s.change > 0 ? 'text-green-400' : s.change < 0 ? 'text-red-400' : 'text-slate-300'}>
                                  {s.change > 0 ? '+' : ''}{s.change}
                                </span>
                              </td>
                              <td className="p-2 text-center">
                                <span className={`px-1 rounded ${s.trend > 2 ? 'bg-red-500/30 text-red-300' : s.trend < -2 ? 'bg-green-500/30 text-green-300' : 'bg-slate-600'}`}>
                                  {s.trend > 2 ? '📈' : s.trend < -2 ? '📉' : '➡️'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs bg-slate-700/30 p-3 rounded-lg">
                      <div><p className="text-slate-400">Başlangıç WIP</p><p className="font-bold text-white">{analysis.firstDayWIP}</p></div>
                      <div><p className="text-slate-400">Bitiş WIP</p><p className="font-bold text-white">{analysis.lastDayWIP}</p></div>
                      <div><p className="text-slate-400">WIP Değişimi</p><p className={`font-bold ${analysis.wipChange > 0 ? 'text-red-400' : analysis.wipChange < 0 ? 'text-green-400' : 'text-white'}`}>{analysis.wipChange > 0 ? '+' : ''}{analysis.wipChange}</p></div>
                    </div>
                  </div>
                )}

                {/* Cycle Time */}
                {cycleTimeData.length > 0 && (
                  <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-4 border border-slate-700/50">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-lg font-semibold text-white">⏱️ Cycle Time ({cycleTimeData.length} iş)</h2>
                      <div className="flex gap-1">
                        <button onClick={() => setIsFullScreenCycleTime(true)} className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-600 text-white rounded">
                          <Maximize2 size={14} /> Tam Ekran
                        </button>
                        <button onClick={() => {
                          const csv = ['PBI ID;PBI Adı;Start;End;Cycle Time', ...cycleTimeData.map(r => `${r.pbiId};${r.pbiName};${r.startDate};${r.endDate};${r.cycleTime}`)].join('\n');
                          const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
                          const link = document.createElement('a');
                          link.href = URL.createObjectURL(blob);
                          link.download = 'cycle_time.csv';
                          link.click();
                        }} className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-500/20 text-blue-300 rounded">
                          <Download size={14} /> CSV
                        </button>
                      </div>
                    </div>
                    <div className="overflow-auto max-h-48 border border-slate-700 rounded-lg text-xs mb-3">
                      <table className="w-full">
                        <thead className="bg-slate-700/50 sticky top-0">
                          <tr>
                            <th className="p-2 text-left text-slate-300 border-b border-slate-600">PBI ID</th>
                            {config.pbiNameColumn && <th className="p-2 text-left text-slate-300 border-b border-slate-600">PBI Adı</th>}
                            <th className="p-2 text-center text-slate-300 border-b border-slate-600">Start</th>
                            <th className="p-2 text-center text-slate-300 border-b border-slate-600">End</th>
                            <th className="p-2 text-center text-slate-300 border-b border-slate-600">Cycle Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cycleTimeData.map((row, idx) => (
                            <tr key={idx} className={idx % 2 === 0 ? 'bg-slate-800/30' : 'bg-slate-700/30'}>
                              <td className="p-2 border-b border-slate-700 text-slate-300">{row.pbiId}</td>
                              {config.pbiNameColumn && <td className="p-2 border-b border-slate-700 text-slate-300">{row.pbiName}</td>}
                              <td className="p-2 text-center border-b border-slate-700 text-slate-300">{row.startDate}</td>
                              <td className="p-2 text-center border-b border-slate-700 text-slate-300">{row.endDate}</td>
                              <td className="p-2 text-center border-b border-slate-700">
                                <span className={`px-2 py-1 rounded ${row.cycleTime <= 5 ? 'bg-green-500/30 text-green-300' : row.cycleTime <= 15 ? 'bg-yellow-500/30 text-yellow-300' : 'bg-red-500/30 text-red-300'}`}>
                                  {row.cycleTime}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="grid grid-cols-5 gap-2 text-center text-xs">
                      <div className="bg-green-500/10 p-2 rounded"><p className="text-slate-400">Min</p><p className="font-bold text-green-400">{Math.min(...cycleTimeData.map(d => d.cycleTime))} gün</p></div>
                      <div className="bg-red-500/10 p-2 rounded"><p className="text-slate-400">Max</p><p className="font-bold text-red-400">{Math.max(...cycleTimeData.map(d => d.cycleTime))} gün</p></div>
                      <div className="bg-blue-500/10 p-2 rounded"><p className="text-slate-400">Ort</p><p className="font-bold text-blue-400">{(cycleTimeData.reduce((s, d) => s + d.cycleTime, 0) / cycleTimeData.length).toFixed(1)} gün</p></div>
                      <div className="bg-purple-500/10 p-2 rounded"><p className="text-slate-400">Medyan</p><p className="font-bold text-purple-400">{(() => { const s = [...cycleTimeData].sort((a, b) => a.cycleTime - b.cycleTime); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m].cycleTime : ((s[m-1].cycleTime + s[m].cycleTime) / 2).toFixed(1); })()} gün</p></div>
                      <div className="bg-orange-500/10 p-2 rounded"><p className="text-slate-400">%85</p><p className="font-bold text-orange-400">{(() => { const s = [...cycleTimeData].sort((a, b) => a.cycleTime - b.cycleTime); const idx = Math.ceil(s.length * 0.85) - 1; return s[Math.min(idx, s.length - 1)].cycleTime; })()} gün</p></div>
                    </div>
                  </div>
                )}

                {/* Throughput Trend */}
                {throughputData.length > 0 && (
                  <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-4 border border-slate-700/50">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-lg font-semibold text-white">📈 Throughput Trend (Aylık)</h2>
                      <div className="flex gap-2 items-center">
                        <span className="text-sm text-slate-400">Toplam: {throughputData.reduce((s, d) => s + d.count, 0)} iş</span>
                        <select 
                          value={movingAvgPeriod} 
                          onChange={(e) => setMovingAvgPeriod(parseInt(e.target.value))}
                          className="px-2 py-1 text-xs border border-slate-600 rounded bg-slate-700 text-white"
                        >
                          <option value={2}>2 Aylık MA</option>
                          <option value={3}>3 Aylık MA</option>
                          <option value={4}>4 Aylık MA</option>
                          <option value={6}>6 Aylık MA</option>
                        </select>
                        <button onClick={() => setIsFullScreenThroughput(true)} className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-600 text-white rounded">
                          <Maximize2 size={14} /> Tam Ekran
                        </button>
                        <button onClick={() => {
                          const csv = ['Ay;Tamamlanan PBI Sayısı;Moving Avg', ...throughputWithMA.map(r => `${r.label};${r.count};${r.movingAvg || ''}`)].join('\n');
                          const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
                          const link = document.createElement('a');
                          link.href = URL.createObjectURL(blob);
                          link.download = 'throughput.csv';
                          link.click();
                        }} className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-500/20 text-blue-300 rounded">
                          <Download size={14} /> CSV
                        </button>
                      </div>
                    </div>
                    <div className="h-64 bg-white rounded-xl p-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={throughputWithMA} margin={{ top: 10, right: 30, left: 0, bottom: 30 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="label" angle={-45} textAnchor="end" height={60} tick={{fontSize: 10}} />
                          <YAxis tick={{fontSize: 10}} />
                          <Tooltip formatter={(value, name) => [value ? `${value} iş` : '-', name === 'count' ? 'Tamamlanan' : `${movingAvgPeriod} Aylık MA`]} />
                          <Legend formatter={(value) => value === 'count' ? 'Tamamlanan' : `${movingAvgPeriod} Aylık MA`} />
                          <Bar dataKey="count" fill="#43A047" radius={[4, 4, 0, 0]} />
                          <Line type="monotone" dataKey="movingAvg" stroke="#E53935" strokeWidth={2} dot={{ fill: '#E53935', r: 3 }} connectNulls={false} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center text-xs mt-3">
                      <div className="bg-green-500/10 p-2 rounded"><p className="text-slate-400">Min Ay</p><p className="font-bold text-green-400">{Math.min(...throughputData.map(d => d.count))} iş</p></div>
                      <div className="bg-red-500/10 p-2 rounded"><p className="text-slate-400">Max Ay</p><p className="font-bold text-red-400">{Math.max(...throughputData.map(d => d.count))} iş</p></div>
                      <div className="bg-blue-500/10 p-2 rounded"><p className="text-slate-400">Aylık Ort</p><p className="font-bold text-blue-400">{(throughputData.reduce((s, d) => s + d.count, 0) / throughputData.length).toFixed(1)} iş</p></div>
                      <div className="bg-purple-500/10 p-2 rounded"><p className="text-slate-400">Toplam Ay</p><p className="font-bold text-purple-400">{throughputData.length} ay</p></div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Reset Button */}
            <button onClick={resetAll} className="w-full py-3 bg-slate-700 text-white rounded-xl text-sm font-medium hover:bg-slate-600 transition-all flex items-center justify-center gap-2">
              <RefreshCw size={16} /> Yeni Analiz Başlat
            </button>
          </div>
        )}

        {/* Full Screen CFD Modal */}
        {isFullScreen && (
          <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex flex-col">
            <div className="flex items-center justify-between p-3 bg-slate-900">
              <h2 className="text-lg font-semibold text-white"><BarChart3 className="inline text-green-400 mr-2" size={20} />CFD</h2>
              <div className="flex gap-2">
                <button onClick={downloadChartAsSVG} className="px-2 py-1 text-xs bg-purple-600 text-white rounded"><Download size={14} className="inline mr-1" />SVG</button>
                <button onClick={downloadChartAsPNG} className="px-2 py-1 text-xs bg-orange-600 text-white rounded"><Download size={14} className="inline mr-1" />PNG</button>
                <button onClick={() => setIsFullScreen(false)} className="px-2 py-1 text-xs bg-red-600 text-white rounded"><X size={14} className="inline mr-1" />Kapat</button>
              </div>
            </div>
            <div className="flex-1 p-4 bg-white m-4 rounded-xl" ref={fullScreenChartRef}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cfdData} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" angle={-45} textAnchor="end" height={100} tick={{fontSize: 12}} />
                  <YAxis tick={{fontSize: 12}} />
                  <Tooltip />
                  <Legend verticalAlign="top" height={36} payload={config.stationColumns.map((col, i) => ({ value: col, type: 'square', color: colors[i % colors.length] }))} />
                  {[...config.stationColumns].reverse().map((col) => {
                    const idx = config.stationColumns.indexOf(col);
                    return <Area key={col} type="monotone" dataKey={col} stackId="1" stroke={colors[idx % colors.length]} fill={colors[idx % colors.length]} />;
                  })}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Full Screen Cycle Time Modal */}
        {isFullScreenCycleTime && (
          <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex flex-col">
            <div className="flex items-center justify-between p-3 bg-slate-900">
              <h2 className="text-lg font-semibold text-white">⏱️ Cycle Time ({cycleTimeData.length} iş)</h2>
              <div className="flex gap-2">
                <button onClick={() => {
                  const csv = ['PBI ID;PBI Adı;Start;End;Cycle Time', ...cycleTimeData.map(r => `${r.pbiId};${r.pbiName};${r.startDate};${r.endDate};${r.cycleTime}`)].join('\n');
                  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
                  const link = document.createElement('a');
                  link.href = URL.createObjectURL(blob);
                  link.download = 'cycle_time.csv';
                  link.click();
                }} className="px-2 py-1 text-xs bg-blue-600 text-white rounded"><Download size={14} className="inline mr-1" />CSV</button>
                <button onClick={() => setIsFullScreenCycleTime(false)} className="px-2 py-1 text-xs bg-red-600 text-white rounded"><X size={14} className="inline mr-1" />Kapat</button>
              </div>
            </div>
            <div className="flex-1 p-4 bg-white m-4 rounded-xl overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 sticky top-0">
                  <tr>
                    <th className="p-3 text-left border-b">PBI ID</th>
                    {config.pbiNameColumn && <th className="p-3 text-left border-b">PBI Adı</th>}
                    <th className="p-3 text-center border-b">Start Tarihi</th>
                    <th className="p-3 text-center border-b">End Tarihi</th>
                    <th className="p-3 text-center border-b">Cycle Time (Gün)</th>
                  </tr>
                </thead>
                <tbody>
                  {cycleTimeData.map((row, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="p-3 border-b">{row.pbiId}</td>
                      {config.pbiNameColumn && <td className="p-3 border-b">{row.pbiName}</td>}
                      <td className="p-3 text-center border-b">{row.startDate}</td>
                      <td className="p-3 text-center border-b">{row.endDate}</td>
                      <td className="p-3 text-center border-b"><span className={`px-2 py-1 rounded ${row.cycleTime <= 5 ? 'bg-green-100 text-green-700' : row.cycleTime <= 15 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{row.cycleTime}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="grid grid-cols-5 gap-4 text-center mt-4 p-4 bg-slate-50 rounded-lg">
                <div className="bg-green-50 p-3 rounded"><p className="text-slate-500 text-sm">Min</p><p className="font-bold text-xl text-green-600">{Math.min(...cycleTimeData.map(d => d.cycleTime))} gün</p></div>
                <div className="bg-red-50 p-3 rounded"><p className="text-slate-500 text-sm">Max</p><p className="font-bold text-xl text-red-600">{Math.max(...cycleTimeData.map(d => d.cycleTime))} gün</p></div>
                <div className="bg-blue-50 p-3 rounded"><p className="text-slate-500 text-sm">Ortalama</p><p className="font-bold text-xl text-blue-600">{(cycleTimeData.reduce((s, d) => s + d.cycleTime, 0) / cycleTimeData.length).toFixed(1)} gün</p></div>
                <div className="bg-purple-50 p-3 rounded"><p className="text-slate-500 text-sm">Medyan</p><p className="font-bold text-xl text-purple-600">{(() => { const s = [...cycleTimeData].sort((a, b) => a.cycleTime - b.cycleTime); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m].cycleTime : ((s[m-1].cycleTime + s[m].cycleTime) / 2).toFixed(1); })()} gün</p></div>
                <div className="bg-orange-50 p-3 rounded"><p className="text-slate-500 text-sm">%85</p><p className="font-bold text-xl text-orange-600">{(() => { const s = [...cycleTimeData].sort((a, b) => a.cycleTime - b.cycleTime); const idx = Math.ceil(s.length * 0.85) - 1; return s[Math.min(idx, s.length - 1)].cycleTime; })()} gün</p></div>
              </div>
            </div>
          </div>
        )}

        {/* Full Screen Throughput Modal */}
        {isFullScreenThroughput && (
          <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex flex-col">
            <div className="flex items-center justify-between p-3 bg-slate-900">
              <h2 className="text-lg font-semibold text-white">📈 Throughput Trend (Aylık)</h2>
              <div className="flex gap-2 items-center">
                <select 
                  value={movingAvgPeriod} 
                  onChange={(e) => setMovingAvgPeriod(parseInt(e.target.value))}
                  className="px-2 py-1 text-xs border rounded bg-slate-700 text-white"
                >
                  <option value={2}>2 Aylık MA</option>
                  <option value={3}>3 Aylık MA</option>
                  <option value={4}>4 Aylık MA</option>
                  <option value={6}>6 Aylık MA</option>
                </select>
                <button onClick={() => {
                  const csv = ['Ay;Tamamlanan PBI Sayısı;Moving Avg', ...throughputWithMA.map(r => `${r.label};${r.count};${r.movingAvg || ''}`)].join('\n');
                  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
                  const link = document.createElement('a');
                  link.href = URL.createObjectURL(blob);
                  link.download = 'throughput.csv';
                  link.click();
                }} className="px-2 py-1 text-xs bg-blue-600 text-white rounded"><Download size={14} className="inline mr-1" />CSV</button>
                <button onClick={() => setIsFullScreenThroughput(false)} className="px-2 py-1 text-xs bg-red-600 text-white rounded"><X size={14} className="inline mr-1" />Kapat</button>
              </div>
            </div>
            <div className="flex-1 p-4 bg-white m-4 rounded-xl flex flex-col">
              <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={throughputWithMA} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" angle={-45} textAnchor="end" height={80} tick={{fontSize: 12}} />
                    <YAxis tick={{fontSize: 12}} />
                    <Tooltip formatter={(value, name) => [value ? `${value} iş` : '-', name === 'count' ? 'Tamamlanan' : `${movingAvgPeriod} Aylık MA`]} />
                    <Legend formatter={(value) => value === 'count' ? 'Tamamlanan' : `${movingAvgPeriod} Aylık MA`} />
                    <Bar dataKey="count" fill="#43A047" radius={[4, 4, 0, 0]} />
                    <Line type="monotone" dataKey="movingAvg" stroke="#E53935" strokeWidth={3} dot={{ fill: '#E53935', r: 4 }} connectNulls={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-4 gap-4 text-center mt-4 p-4 bg-slate-50 rounded-lg">
                <div className="bg-green-50 p-3 rounded"><p className="text-slate-500 text-sm">Min Ay</p><p className="font-bold text-xl text-green-600">{Math.min(...throughputData.map(d => d.count))} iş</p></div>
                <div className="bg-red-50 p-3 rounded"><p className="text-slate-500 text-sm">Max Ay</p><p className="font-bold text-xl text-red-600">{Math.max(...throughputData.map(d => d.count))} iş</p></div>
                <div className="bg-blue-50 p-3 rounded"><p className="text-slate-500 text-sm">Aylık Ortalama</p><p className="font-bold text-xl text-blue-600">{(throughputData.reduce((s, d) => s + d.count, 0) / throughputData.length).toFixed(1)} iş</p></div>
                <div className="bg-purple-50 p-3 rounded"><p className="text-slate-500 text-sm">Toplam Ay</p><p className="font-bold text-purple-600 text-xl">{throughputData.length} ay</p></div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-6 text-center text-slate-500 text-xs">
          Kanban Analytics Suite • Monte Carlo (10.000 iterasyon) + CFD + Cycle Time + Throughput Trend
        </footer>
      </div>
    </div>
  );
}
