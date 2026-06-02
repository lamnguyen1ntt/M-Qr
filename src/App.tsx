/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { LayoutDashboard, QrCode, PieChart, Settings, ArrowUp, Plus, Download, Grid2X2, X, Calendar } from 'lucide-react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { format, subDays } from 'date-fns';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [qrList, setQrList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [stats, setStats] = useState<any>({
    runningQRs: 0,
    totalScans: 0,
    scansToday: 0,
    scansWeek: 0,
    trend: []
  });
  const [dateRange, setDateRange] = useState({ 
    start: format(subDays(new Date(), 7), 'yyyy-MM-dd'), 
    end: format(new Date(), 'yyyy-MM-dd') 
  });

  const fetchQRs = async () => {
    try {
      const query = new URLSearchParams();
      if (dateRange.start) query.append('start', dateRange.start);
      if (dateRange.end) query.append('end', dateRange.end);
      const res = await fetch(`/api/qr?${query.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setQrList(data);
      }
    } catch (error) {
      console.error("Failed to fetch QRs:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const query = new URLSearchParams();
      if (dateRange.start) query.append('start', dateRange.start);
      if (dateRange.end) query.append('end', dateRange.end);
      const res = await fetch(`/api/stats?${query.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Failed to fetch Stats:", error);
    }
  };

  useEffect(() => {
    // Only fetch QRs if not redirecting
    if (!window.location.pathname.startsWith('/go/')) {
      fetchQRs();
      fetchStats();
    }
  }, [dateRange]);

  const [newQrName, setNewQrName] = useState('');
  const [newQrUrl, setNewQrUrl] = useState('');

  // Edit Modal State
  const [selectedQr, setSelectedQr] = useState<any>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editQrName, setEditQrName] = useState('');
  const [editQrUrl, setEditQrUrl] = useState('');

  // Delete Modal State
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const handleCreateQr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQrName || !newQrUrl) return;
    
    try {
      const res = await fetch('/api/qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newQrName, url: newQrUrl })
      });
      if (res.ok) {
        fetchQRs();
        fetchStats();
        setIsCreateModalOpen(false);
        setNewQrName('');
        setNewQrUrl('');
        setActiveTab('my-qrs');
      } else {
        const errorData = await res.json().catch(() => null);
        alert(`Lỗi khi tạo mã: ${errorData?.error || res.statusText || 'Unknown error'}`);
      }
    } catch (error: any) {
      console.error("Failed to create QR:", error);
      alert(`Lỗi khi kết nối: ${error.message}`);
    }
  };

  const openEditModal = (qr: any) => {
    setSelectedQr(qr);
    setEditQrName(qr.name);
    setEditQrUrl(qr.url);
    setIsEditModalOpen(true);
  };

  const handleEditQr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQr || !editQrName || !editQrUrl) return;
    
    try {
      const res = await fetch(`/api/qr/${selectedQr.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editQrName, url: editQrUrl })
      });
      if (res.ok) {
        fetchQRs();
        setIsEditModalOpen(false);
        setSelectedQr(null);
      }
    } catch (error) {
      console.error("Failed to update QR:", error);
    }
  };

  const handleDeleteQr = (id: number) => {
    setDeleteId(id);
  };

  const confirmDelete = async () => {
    if (deleteId) {
      try {
        const res = await fetch(`/api/qr/${deleteId}`, {
          method: 'DELETE'
        });
        if (res.ok) {
          fetchQRs();
          fetchStats();
          if (selectedQr?.id === deleteId) {
            setIsEditModalOpen(false);
            setSelectedQr(null);
          }
          setDeleteId(null);
        }
      } catch (error) {
        console.error("Failed to delete QR:", error);
      }
    }
  };

  const downloadPNG = () => {
    const canvas = document.getElementById('qr-canvas-hidden') as HTMLCanvasElement;
    if (canvas) {
      const pngUrl = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.href = pngUrl;
      downloadLink.download = `${selectedQr?.name || 'qrcode'}.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    }
  };

  const downloadSVG = () => {
    const svg = document.getElementById('qr-svg-visible');
    if (svg) {
      const svgData = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      downloadLink.href = url;
      downloadLink.download = `${selectedQr?.name || 'qrcode'}.svg`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(url);
    }
  };

  const handleExportCSV = () => {
    const header = ['Ngày bắt đầu', 'Ngày kết thúc', 'Tên mã QR', 'URL', 'Lượt quét', 'Trạng thái'];
    const rows = qrList.map(qr => [
      dateRange.start || 'N/A',
      dateRange.end || 'N/A',
      qr.name, 
      qr.url, 
      qr.scans || 0, 
      qr.status
    ]);
    const csvContent = [header, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `qrcode_stats_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleToggleStatus = async (qr: any) => {
    const newStatus = qr.status === 'Đang chạy' ? 'Đã dừng' : 'Đang chạy';
    try {
      const res = await fetch(`/api/qr/${qr.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        fetchQRs();
        fetchStats();
      }
    } catch (error) {
      console.error("Failed to toggle status:", error);
    }
  };

  const isRedirecting = window.location.pathname.startsWith('/go/');
  if (isRedirecting) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-bg text-text-main font-sans">
        <div className="text-center flex flex-col items-center">
          <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-lg font-medium">Đang chuyển hướng...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-bg text-text-main font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[240px] bg-sidebar-bg text-white flex flex-col shrink-0">
        <div className="p-6 flex items-center gap-3 font-bold text-[18px] border-b border-[#1e293b]">
          <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center">
            <Grid2X2 className="w-5 h-5 text-white" />
          </div>
          <span>QR DYNAMIC PRO</span>
        </div>
        <nav className="flex-1 px-3 py-5 flex flex-col gap-1">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-[14px] font-medium transition-colors w-full text-left ${activeTab === 'dashboard' ? 'bg-[#1e293b] text-white' : 'text-sidebar-text hover:bg-[#1e293b] hover:text-white'}`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Bảng điều khiển</span>
          </button>
          <button 
            onClick={() => setActiveTab('my-qrs')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-[14px] font-medium transition-colors w-full text-left ${activeTab === 'my-qrs' ? 'bg-[#1e293b] text-white' : 'text-sidebar-text hover:bg-[#1e293b] hover:text-white'}`}
          >
            <QrCode className="w-4 h-4" />
            <span>Mã QR của tôi</span>
          </button>
          <button 
            onClick={() => setActiveTab('stats')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-[14px] font-medium transition-colors w-full text-left ${activeTab === 'stats' ? 'bg-[#1e293b] text-white' : 'text-sidebar-text hover:bg-[#1e293b] hover:text-white'}`}
          >
            <PieChart className="w-4 h-4" />
            <span>Thống kê & Báo cáo</span>
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-[14px] font-medium transition-colors w-full text-left ${activeTab === 'settings' ? 'bg-[#1e293b] text-white' : 'text-sidebar-text hover:bg-[#1e293b] hover:text-white'}`}
          >
            <Settings className="w-4 h-4" />
            <span>Cài đặt</span>
          </button>
        </nav>
        <div className="p-6 border-t border-[#1e293b]">
          <div className="text-[12px] text-sidebar-text">Đang đăng nhập:</div>
          <div className="text-[14px] mt-1 font-medium">Nguyễn Văn A</div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <header className="h-16 shrink-0 border-b border-border-custom bg-white flex items-center justify-between px-8">
          <div className="text-[18px] font-semibold">
            {activeTab === 'dashboard' && 'Tổng quan hoạt động'}
            {activeTab === 'my-qrs' && 'Quản lý Mã QR'}
            {activeTab === 'stats' && 'Thống kê chi tiết'}
            {activeTab === 'settings' && 'Cài đặt tài khoản'}
          </div>
          <div className="flex gap-3 items-center">
            {activeTab === 'dashboard' && (
              <div className="flex items-center gap-2 mr-4 bg-slate-50 border border-slate-200 rounded-md px-3 py-1.5 h-full">
                <Calendar className="w-4 h-4 text-slate-500" />
                <input 
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                  className="bg-transparent text-sm font-medium text-slate-700 focus:outline-none"
                />
                <span className="text-slate-400">-</span>
                <input 
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                  className="bg-transparent text-sm font-medium text-slate-700 focus:outline-none"
                />
              </div>
            )}
            <button onClick={handleExportCSV} className="px-4 py-2 bg-white border border-border-custom text-text-main rounded-md text-[14px] font-medium hover:bg-slate-50 transition-colors flex items-center gap-2 cursor-pointer">
              <Download className="w-4 h-4" /> Xuất dữ liệu
            </button>
            <button 
              onClick={() => setIsCreateModalOpen(true)}
              className="px-4 py-2 bg-accent text-white rounded-md text-[14px] font-medium hover:opacity-90 transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Tạo mã QR mới
            </button>
          </div>
        </header>

        <div className="py-6 px-8 flex-1 flex flex-col gap-6 overflow-y-auto">
          {activeTab === 'dashboard' && (
            <>
              {/* Stats Grid */}
              <div className="grid grid-cols-4 gap-5">
                <div className="bg-white p-5 rounded-xl border border-border-custom shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                  <div className="text-[12px] text-text-muted uppercase tracking-[0.025em] font-semibold mb-2">Tổng lượt quét</div>
                  <div className="text-[24px] font-bold">{(stats?.totalScans || 0).toLocaleString()}</div>
                  <div className="text-[12px] text-[#10b981] mt-1 flex items-center gap-1 font-medium">
                    <ArrowUp className="w-3 h-3" /> Dữ liệu theo thời gian
                  </div>
                </div>
                <div className="bg-white p-5 rounded-xl border border-border-custom shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                  <div className="text-[12px] text-text-muted uppercase tracking-[0.025em] font-semibold mb-2">Lượt quét hôm nay</div>
                  <div className="text-[24px] font-bold">{(stats?.scansToday || 0).toLocaleString()}</div>
                  <div className="text-[12px] text-text-muted mt-1 flex items-center gap-1 font-medium">
                    Trong ngày hiện tại
                  </div>
                </div>
                <div className="bg-white p-5 rounded-xl border border-border-custom shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                  <div className="text-[12px] text-text-muted uppercase tracking-[0.025em] font-semibold mb-2">Lượt quét tuần này</div>
                  <div className="text-[24px] font-bold">{(stats?.scansWeek || 0).toLocaleString()}</div>
                  <div className="text-[12px] text-text-muted mt-1 flex items-center gap-1 font-medium">
                    Trong 7 ngày qua
                  </div>
                </div>
                <div className="bg-white p-5 rounded-xl border border-border-custom shadow-[0_1px_3px_rgba(0,0,0,0.05)] flex flex-col">
                  <div className="text-[12px] text-text-muted uppercase tracking-[0.025em] font-semibold mb-2">Mã QR đang chạy</div>
                  <div className="text-[24px] font-bold">{stats?.runningQRs || 0}</div>
                  <div className="text-[12px] text-[#10b981] mt-1 font-medium">
                    Hoạt động tốt
                  </div>
                </div>
              </div>

              {/* Main Grid */}
              <div className="grid grid-cols-[2fr_1fr] gap-5 flex-1 min-h-[300px]">
                <div className="bg-white rounded-xl border border-border-custom flex flex-col">
                  <div className="p-4 px-5 border-b border-border-custom flex justify-between items-center shrink-0">
                    <div className="font-semibold text-[14px]">Mã QR gần đây</div>
                    <div 
                      className="text-accent text-[12px] cursor-pointer hover:underline"
                      onClick={() => setActiveTab('my-qrs')}
                    >
                      Xem tất cả
                    </div>
                  </div>
                  <div className="flex-1 overflow-x-auto p-0">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr>
                          <th className="py-3 px-5 text-[12px] text-text-muted font-semibold bg-bg border-b border-border-custom">TÊN MÃ QR</th>
                          <th className="py-3 px-5 text-[12px] text-text-muted font-semibold bg-bg border-b border-border-custom">LINK ĐÍCH</th>
                          <th className="py-3 px-5 text-[12px] text-text-muted font-semibold bg-bg border-b border-border-custom">LƯỢT QUÉT</th>
                          <th className="py-3 px-5 text-[12px] text-text-muted font-semibold bg-bg border-b border-border-custom">TRẠNG THÁI</th>
                        </tr>
                      </thead>
                      <tbody>
                        {qrList.slice(0, 4).map(qr => (
                          <tr key={qr.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-3 px-5 text-[13px] text-text-main border-b border-border-custom">{qr.name}</td>
                            <td className="py-3 px-5 text-[13px] text-text-main border-b border-border-custom">{qr.url}</td>
                            <td className="py-3 px-5 text-[13px] text-text-main border-b border-border-custom">{(qr.scans || 0).toLocaleString()}</td>
                            <td className="py-3 px-5 border-b border-border-custom">
                              <span className={`px-2 py-1 rounded-full text-[11px] font-semibold ${qr.status === 'Đang chạy' ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#fee2e2] text-[#991b1b]'}`}>
                                {qr.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-border-custom flex flex-col">
                  <div className="p-4 px-5 border-b border-border-custom shrink-0">
                    <div className="font-semibold text-[14px]">Xu hướng quét (7 ngày)</div>
                  </div>
                  <div className="flex-1 flex items-end gap-2 p-5 pb-0">
                    <div className="flex-1 bg-border-custom rounded-t-[4px] transition-all min-h-[20px]" style={{ height: '40%' }}></div>
                    <div className="flex-1 bg-border-custom rounded-t-[4px] transition-all min-h-[20px]" style={{ height: '60%' }}></div>
                    <div className="flex-1 bg-border-custom rounded-t-[4px] transition-all min-h-[20px]" style={{ height: '45%' }}></div>
                    <div className="flex-1 bg-border-custom rounded-t-[4px] transition-all min-h-[20px]" style={{ height: '80%' }}></div>
                    <div className="flex-1 bg-accent rounded-t-[4px] transition-all min-h-[20px]" style={{ height: '95%' }}></div>
                    <div className="flex-1 bg-border-custom rounded-t-[4px] transition-all min-h-[20px]" style={{ height: '70%' }}></div>
                    <div className="flex-1 bg-border-custom rounded-t-[4px] transition-all min-h-[20px]" style={{ height: '85%' }}></div>
                  </div>
                  <div className="py-3 px-5 border-t border-border-custom text-[12px] text-text-muted text-center mt-auto shrink-0">
                    Thứ 2 — Chủ Nhật
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'my-qrs' && (
            <div className="bg-white rounded-xl border border-border-custom flex flex-col h-full shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
              <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr>
                      <th className="py-3 px-5 text-[12px] text-text-muted font-semibold bg-bg border-b border-border-custom">TÊN MÃ QR</th>
                      <th className="py-3 px-5 text-[12px] text-text-muted font-semibold bg-bg border-b border-border-custom">LINK ĐÍCH</th>
                      <th className="py-3 px-5 text-[12px] text-text-muted font-semibold bg-bg border-b border-border-custom">LƯỢT QUÉT</th>
                      <th className="py-3 px-5 text-[12px] text-text-muted font-semibold bg-bg border-b border-border-custom">TRẠNG THÁI</th>
                      <th className="py-3 px-5 text-[12px] text-text-muted font-semibold bg-bg border-b border-border-custom text-right">THAO TÁC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {qrList.map(qr => (
                      <tr key={qr.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-4 px-5 text-[13px] font-medium text-text-main border-b border-border-custom">{qr.name}</td>
                        <td className="py-4 px-5 text-[13px] text-text-muted border-b border-border-custom">{qr.url}</td>
                        <td className="py-4 px-5 text-[13px] text-text-main border-b border-border-custom">{(qr.scans || 0).toLocaleString()}</td>
                        <td className="py-4 px-5 border-b border-border-custom">
                          <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${qr.status === 'Đang chạy' ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#fee2e2] text-[#991b1b]'}`}>
                            {qr.status}
                          </span>
                        </td>
                        <td className="py-4 px-5 border-b border-border-custom text-right min-w-[210px]">
                          <button 
                            onClick={() => openEditModal(qr)}
                            className="text-accent text-[13px] font-medium hover:underline mr-4"
                          >
                            Chỉnh sửa / Xem QR
                          </button>
                          <button 
                            onClick={() => handleToggleStatus(qr)}
                            className="text-slate-600 text-[13px] font-medium hover:underline mr-4 cursor-pointer"
                          >
                            {qr.status === 'Đang chạy' ? 'Tắt mã' : 'Bật mã'}
                          </button>
                          <button 
                            onClick={() => handleDeleteQr(qr.id)}
                            className="text-red-600 text-[13px] font-medium hover:underline cursor-pointer"
                          >
                            Xóa
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(activeTab === 'stats' || activeTab === 'settings') && (
            <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-xl border border-border-custom shadow-[0_1px_3px_rgba(0,0,0,0.05)] text-center p-8">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                {activeTab === 'stats' && <PieChart className="w-8 h-8 text-slate-400" />}
                {activeTab === 'settings' && <Settings className="w-8 h-8 text-slate-400" />}
              </div>
              <h3 className="text-lg font-semibold text-text-main mb-2">Chức năng đang được phát triển</h3>
              <p className="text-text-muted text-sm max-w-sm">
                Tính năng {activeTab === 'stats' ? 'thống kê chi tiết' : 'cài đặt tài khoản'} chưa có sẵn nội dung. Chúng ta sẽ làm ở các bước tiếp theo sau khi thiết lập Backend!
              </p>
            </div>
          )}
        </div>

        {/* Modal Tạo QR */}
        {isCreateModalOpen && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col">
              <div className="flex items-center justify-between p-5 border-b border-slate-100">
                <h2 className="text-lg font-semibold text-slate-800">Tạo mã QR mới</h2>
                <button 
                  onClick={() => setIsCreateModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleCreateQr} className="p-6 flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <label className="text-[13px] font-semibold text-slate-700">Tên mã QR</label>
                  <input 
                    type="text" 
                    required
                    value={newQrName}
                    onChange={(e) => setNewQrName(e.target.value)}
                    placeholder="VD: Chiến dịch mùa đông..." 
                    className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[13px] font-semibold text-slate-700">Link đích (Destination URL)</label>
                  <input 
                    type="text" 
                    required
                    value={newQrUrl}
                    onChange={(e) => setNewQrUrl(e.target.value)}
                    placeholder="https://example.com" 
                    className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                </div>
                <div className="mt-2 flex justify-end gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg transition-colors border border-slate-200 cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button 
                    type="submit"
                    className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm cursor-pointer"
                  >
                    Tạo mã ngay
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal Chỉnh Sửa & Xem QR */}
        {isEditModalOpen && selectedQr && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex overflow-hidden">
              {/* Cột trái: QR hiển thị */}
              <div className="w-1/2 bg-slate-50 p-6 flex flex-col items-center justify-center border-r border-slate-100">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-4 relative hover:shadow-md transition-shadow">
                  <a href={`${window.location.origin}/go/${selectedQr.id}`} target="_blank" rel="noreferrer" className="block w-fit mx-auto cursor-pointer" title="Click để test Link Redirect">
                    <QRCodeSVG 
                      id="qr-svg-visible"
                      value={`${window.location.origin}/go/${selectedQr.id}`} 
                      size={160} 
                    />
                  </a>
                  <div className="hidden">
                    <QRCodeCanvas 
                      id="qr-canvas-hidden"
                      value={`${window.location.origin}/go/${selectedQr.id}`} 
                      size={900} 
                    />
                  </div>
                </div>
                <h3 className="text-sm font-semibold text-slate-800 text-center">{editQrName || selectedQr.name}</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-[200px] truncate">{editQrUrl || selectedQr.url}</p>
                <div className="text-[10px] text-center text-slate-400 mt-2 px-2">
                  * Mẹo: Click trực tiếp vào QR code để test thử. Do giới hạn bảo mật, quét bằng điện thoại có thể bị yêu cầu đăng nhập tài khoản.
                </div>
                <div className="flex gap-2 mt-4 w-full px-4">
                  <button onClick={downloadPNG} className="flex-1 py-1.5 bg-white border border-slate-200 rounded text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors shadow-sm">Tải PNG</button>
                  <button onClick={downloadSVG} className="flex-1 py-1.5 bg-white border border-slate-200 rounded text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors shadow-sm">Tải SVG</button>
                </div>
              </div>
              
              {/* Cột phải: Form chỉnh sửa */}
              <div className="w-1/2 flex flex-col">
                <div className="flex items-center justify-between p-5 border-b border-slate-100">
                  <h2 className="text-lg font-semibold text-slate-800">Chỉnh sửa mã QR</h2>
                  <button 
                    onClick={() => {
                      setIsEditModalOpen(false);
                      setSelectedQr(null);
                    }}
                    className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleEditQr} className="p-6 flex flex-col gap-5 flex-1 justify-between">
                  <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-2">
                      <label className="text-[13px] font-semibold text-slate-700">Tên mã QR</label>
                      <input 
                        type="text" 
                        required
                        value={editQrName}
                        onChange={(e) => setEditQrName(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-[13px] font-semibold text-slate-700">Link đích hiện tại</label>
                      <input 
                        type="text" 
                        required
                        value={editQrUrl}
                        onChange={(e) => setEditQrUrl(e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">Thay đổi link ở đây sẽ không làm thay đổi hình ảnh QR code. Khách hàng vẫn quét mã cũ và được chuyển hướng tự động đến link mới này.</p>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end gap-3 pt-4 border-t border-slate-100">
                    <button 
                      type="button"
                      onClick={() => {
                        setIsEditModalOpen(false);
                        setSelectedQr(null);
                      }}
                      className="px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg transition-colors border border-slate-200 cursor-pointer"
                    >
                      Hủy
                    </button>
                    <button 
                      type="submit"
                      className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm cursor-pointer"
                    >
                      Lưu thay đổi
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteId && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 flex flex-col gap-4">
              <h3 className="text-lg font-semibold text-slate-900">Xác nhận xóa</h3>
              <p className="text-sm text-slate-600">Bạn có chắc chắn muốn xóa mã QR này không? Thao tác này không thể hoàn tác.</p>
              <div className="flex justify-end gap-3 mt-2">
                <button 
                  onClick={() => setDeleteId(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-lg cursor-pointer"
                >
                  Hủy
                </button>
                <button 
                  onClick={confirmDelete}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer"
                >
                  Xóa mã
                </button>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
