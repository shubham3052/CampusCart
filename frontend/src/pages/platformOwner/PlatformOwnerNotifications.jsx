import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  Send, 
  CheckCheck, 
  RefreshCw, 
  AlertTriangle, 
  Info, 
  Tag, 
  Package, 
  Radio, 
  Users, 
  CheckCircle2, 
  X
} from 'lucide-react';
import platformOwnerService from '../../services/platformOwnerService';

export default function PlatformOwnerNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastData, setBroadcastData] = useState({
    target_group: 'ALL',
    notification_type: 'SYSTEM_ALERT',
    title: '',
    message: ''
  });
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  const fetchFeed = async () => {
    try {
      setLoading(true);
      const [feedRes, unreadRes] = await Promise.all([
        platformOwnerService.getNotifications(),
        platformOwnerService.getUnreadNotificationCount()
      ]);
      setNotifications(feedRes.data || []);
      setUnreadCount(unreadRes.data?.unread_count || 0);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeed();
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await platformOwnerService.markAllNotificationsRead();
      setUnreadCount(0);
      setNotifications(notifications.map(n => ({ ...n, is_read: true })));
      setSuccessMessage('All notifications marked as read.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  const handleBroadcast = async (e) => {
    e.preventDefault();
    try {
      setBroadcastLoading(true);
      setErrorMessage(null);
      const res = await platformOwnerService.broadcastNotification(broadcastData);
      setSuccessMessage(`Broadcast sent to ${res.data?.recipient_count || 0} active users.`);
      setShowBroadcastModal(false);
      setBroadcastData({
        target_group: 'ALL',
        notification_type: 'SYSTEM_ALERT',
        title: '',
        message: ''
      });
      fetchFeed();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      console.error('Broadcast failed:', err);
      setErrorMessage(err.response?.data?.message || 'Failed to dispatch platform broadcast.');
    } finally {
      setBroadcastLoading(false);
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'INVENTORY_ALERT':
        return <Package className="w-5 h-5 text-amber-400" />;
      case 'OFFER_ALERT':
        return <Tag className="w-5 h-5 text-indigo-400" />;
      case 'ORDER_STATUS':
        return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
      default:
        return <Bell className="w-5 h-5 text-blue-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Bell className="w-6 h-6" />
            </span>
            System Notification Engine
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Incoming critical alerts, low-stock signals, and platform-wide emergency broadcasting.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition"
            >
              <CheckCheck className="w-4 h-4 text-emerald-400" />
              Mark All Read ({unreadCount})
            </button>
          )}
          <button
            onClick={() => setShowBroadcastModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/20 transition"
          >
            <Radio className="w-4 h-4" />
            Dispatch Broadcast
          </button>
          <button
            onClick={fetchFeed}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl border border-slate-700 transition"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Notifications Feed */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden divide-y divide-slate-800/80">
        {notifications.length > 0 ? (
          notifications.map((item) => (
            <div
              key={item.id}
              className={`p-5 transition flex items-start gap-4 ${
                !item.is_read ? 'bg-indigo-950/20' : 'hover:bg-slate-800/30'
              }`}
            >
              <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60 flex-shrink-0">
                {getTypeIcon(item.notification_type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h4 className={`text-sm font-semibold truncate ${!item.is_read ? 'text-white' : 'text-slate-300'}`}>
                    {item.title}
                  </h4>
                  <span className="text-[11px] text-slate-500 whitespace-nowrap">
                    {new Date(item.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{item.message}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[10px] uppercase font-mono font-bold tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                    {item.notification_type}
                  </span>
                  {!item.is_read && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      Unread
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="p-12 text-center text-slate-500 text-sm">
            <Bell className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-50" />
            No system notifications on record.
          </div>
        )}
      </div>

      {/* Broadcast Modal */}
      {showBroadcastModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-indigo-400" />
                <h3 className="text-lg font-bold text-white">Platform Broadcast Engine</h3>
              </div>
              <button
                onClick={() => setShowBroadcastModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMessage && (
              <div className="p-3 mb-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleBroadcast} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Target Recipient Group</label>
                <select
                  value={broadcastData.target_group}
                  onChange={(e) => setBroadcastData({ ...broadcastData, target_group: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="ALL">All Platform Users (Global)</option>
                  <option value="STUDENT">Students Only</option>
                  <option value="SHOP_OWNER">Shop Owners Only</option>
                  <option value="DELIVERY_AGENT">Delivery Partners Only</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Alert Category</label>
                <select
                  value={broadcastData.notification_type}
                  onChange={(e) => setBroadcastData({ ...broadcastData, notification_type: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="SYSTEM_ALERT">System Notice</option>
                  <option value="OFFER_ALERT">Promotional Alert</option>
                  <option value="INVENTORY_ALERT">Inventory Warning</option>
                  <option value="ORDER_STATUS">Order Update</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Notification Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Scheduled Maintenance or Campus Holiday Hours"
                  value={broadcastData.title}
                  onChange={(e) => setBroadcastData({ ...broadcastData, title: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Detailed Message</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Type the message to be delivered to user notification trays..."
                  value={broadcastData.message}
                  onChange={(e) => setBroadcastData({ ...broadcastData, message: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowBroadcastModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={broadcastLoading}
                  className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-lg shadow-indigo-600/20 transition"
                >
                  <Send className={`w-3.5 h-3.5 ${broadcastLoading ? 'animate-spin' : ''}`} />
                  {broadcastLoading ? 'Broadcasting...' : 'Broadcast to Recipients'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
