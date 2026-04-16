import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type SosRequest = {
  id: string;
  user_id: string;
  location: { latitude: number; longitude: number } | null;
  message: string | null;
  status: 'initial' | 'acknowledged' | 'resolved';
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

type DriverRow = {
  user_id: string;
  is_available: boolean;
  updated_at: string;
  display_name: string | null;
  email: string | null;
  tier: string | null;
};

type RideRow = {
  id: string;
  status: string;
  passenger_id: string | null;
  driver_id: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  created_at: string;
  kind_points: number | null;
};

type Tab = 'sos' | 'drivers' | 'rides';

// ─── Tab bar ─────────────────────────────────────────────────────────────────

function TabBar({ active, onSelect }: { active: Tab; onSelect: (t: Tab) => void }) {
  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'sos',     label: 'SOS',     icon: '🆘' },
    { key: 'drivers', label: 'Drivers', icon: '🚗' },
    { key: 'rides',   label: 'Rides',   icon: '📋' },
  ];
  return (
    <View style={styles.tabBar}>
      {tabs.map((t) => (
        <Pressable
          key={t.key}
          style={[styles.tabItem, active === t.key && styles.tabItemActive]}
          onPress={() => onSelect(t.key)}
        >
          <Text style={styles.tabIcon}>{t.icon}</Text>
          <Text style={[styles.tabLabel, active === t.key && styles.tabLabelActive]}>
            {t.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AdminScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('sos');

  // SOS state
  const [sosList, setSosList] = useState<SosRequest[]>([]);
  const [sosRefreshing, setSosRefreshing] = useState(false);

  // Drivers state
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [driversRefreshing, setDriversRefreshing] = useState(false);

  // Rides state
  const [rides, setRides] = useState<RideRow[]>([]);
  const [ridesRefreshing, setRidesRefreshing] = useState(false);

  // ── Data fetchers ──────────────────────────────────────────────────────────

  const fetchSosRequests = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('sos_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setSosList((data as SosRequest[]) || []);
    } catch {
      Alert.alert('Error', 'Failed to load SOS requests.');
    }
  }, []);

  const fetchDrivers = useCallback(async () => {
    if (!supabase) return;
    try {
      // Get all driver_presence rows, then batch-join profile names
      const { data: presence, error: pErr } = await supabase
        .from('driver_presence')
        .select('user_id, is_available, updated_at')
        .order('updated_at', { ascending: false })
        .limit(100);
      if (pErr) throw pErr;

      if (!presence || presence.length === 0) { setDrivers([]); return; }

      const userIds = presence.map((p: { user_id: string }) => p.user_id);
      const { data: profiles, error: prErr } = await supabase
        .from('profiles')
        .select('id, display_name, email, tier')
        .in('id', userIds);
      if (prErr) throw prErr;

      const profileMap = new Map(
        (profiles || []).map((pr: { id: string; display_name: string | null; email: string | null; tier: string | null }) => [
          pr.id, pr
        ])
      );

      const rows: DriverRow[] = presence.map((p: { user_id: string; is_available: boolean; updated_at: string }) => {
        const pr = profileMap.get(p.user_id) as { display_name: string | null; email: string | null; tier: string | null } | undefined;
        return {
          user_id: p.user_id,
          is_available: p.is_available,
          updated_at: p.updated_at,
          display_name: pr?.display_name ?? null,
          email: pr?.email ?? null,
          tier: pr?.tier ?? null,
        };
      });
      setDrivers(rows);
    } catch {
      Alert.alert('Error', 'Failed to load drivers.');
    }
  }, []);

  const fetchRides = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('rides')
        .select('id, status, passenger_id, driver_id, pickup_address, dropoff_address, created_at, kind_points')
        .order('created_at', { ascending: false })
        .limit(60);
      if (error) throw error;
      setRides((data as RideRow[]) || []);
    } catch {
      Alert.alert('Error', 'Failed to load rides.');
    }
  }, []);

  // ── Auth + initial load ────────────────────────────────────────────────────

  const checkAdminAccess = useCallback(async () => {
    if (!supabase) { setIsAdmin(false); setLoading(false); return; }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setIsAdmin(false); return; }
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();
      if (error || !data || data.role !== 'admin') {
        setIsAdmin(false);
      } else {
        setIsAdmin(true);
        await Promise.all([fetchSosRequests(), fetchDrivers(), fetchRides()]);
      }
    } catch {
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }, [fetchSosRequests, fetchDrivers, fetchRides]);

  useEffect(() => { checkAdminAccess(); }, [checkAdminAccess]);

  // ── SOS actions ───────────────────────────────────────────────────────────

  const updateSosStatus = async (id: string, newStatus: 'acknowledged' | 'resolved') => {
    if (!supabase) return;
    try {
      const updates: Partial<SosRequest> = {
        status: newStatus,
        updated_at: new Date().toISOString(),
        ...(newStatus === 'resolved' ? { resolved_at: new Date().toISOString() } : {}),
      };
      const { error } = await supabase.from('sos_requests').update(updates).eq('id', id);
      if (error) throw error;
      setSosList(prev => prev.map(item => item.id === id ? { ...item, ...updates } as SosRequest : item));
    } catch {
      Alert.alert('Error', 'Failed to update SOS status.');
    }
  };

  // ── Driver actions ────────────────────────────────────────────────────────

  const suspendDriver = (userId: string, displayName: string | null) => {
    Alert.alert(
      'Suspend driver',
      `Remove ${displayName ?? userId.slice(0, 8)} from the driver pool? They will no longer appear to passengers.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Suspend',
          style: 'destructive',
          onPress: async () => {
            if (!supabase) return;
            try {
              await supabase
                .from('driver_presence')
                .update({ is_available: false })
                .eq('user_id', userId);
              setDrivers(prev =>
                prev.map(d => d.user_id === userId ? { ...d, is_available: false } : d)
              );
            } catch {
              Alert.alert('Error', 'Failed to suspend driver.');
            }
          },
        },
      ]
    );
  };

  // ── Loading / access denied guards ───────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (isAdmin === false) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>{t('accessDenied')}</Text>
        <Text style={styles.errorBody}>{t('adminPrivilegesRequired')}</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>{t('goBack')}</Text>
        </Pressable>
      </View>
    );
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderSosItem = ({ item }: { item: SosRequest }) => {
    const isInitial = item.status === 'initial';
    const isAck = item.status === 'acknowledged';
    return (
      <View style={[styles.card, isInitial && styles.cardUrgent]}>
        <View style={styles.cardHeader}>
          <Text style={styles.dateText}>{new Date(item.created_at).toLocaleString()}</Text>
          <View style={[styles.badge,
            isInitial ? styles.badgeRed : isAck ? styles.badgeYellow : styles.badgeGreen
          ]}>
            <Text style={styles.badgeText}>{item.status.toUpperCase()}</Text>
          </View>
        </View>
        <Text style={styles.messageText}>{item.message || t('noMessageProvided')}</Text>
        {item.location ? (
          <Text style={styles.metaText}>
            {item.location.latitude.toFixed(5)}, {item.location.longitude.toFixed(5)}
          </Text>
        ) : (
          <Text style={styles.metaText}>{t('locationUnavailable')}</Text>
        )}
        <Text style={styles.mutedText}>{t('userIdColon')} {item.user_id}</Text>
        <View style={styles.actionRow}>
          {isInitial && (
            <Pressable style={[styles.actionBtn, styles.btnAck]}
              onPress={() => updateSosStatus(item.id, 'acknowledged')}>
              <Text style={styles.actionBtnText}>{t('acknowledge')}</Text>
            </Pressable>
          )}
          {(isInitial || isAck) && (
            <Pressable style={[styles.actionBtn, styles.btnResolve]}
              onPress={() => updateSosStatus(item.id, 'resolved')}>
              <Text style={styles.actionBtnText}>{t('markResolved')}</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  const renderDriverItem = ({ item }: { item: DriverRow }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.messageText}>{item.display_name ?? '(no name)'}</Text>
          <Text style={styles.mutedText}>{item.email ?? item.user_id.slice(0, 16)}</Text>
        </View>
        <View style={[styles.badge, item.is_available ? styles.badgeGreen : styles.badgeGrey]}>
          <Text style={styles.badgeText}>{item.is_available ? 'ONLINE' : 'OFFLINE'}</Text>
        </View>
      </View>
      <View style={styles.driverMeta}>
        {item.tier && (
          <View style={styles.tierChip}>
            <Text style={styles.tierText}>{item.tier}</Text>
          </View>
        )}
        <Text style={styles.metaText}>
          Last seen {new Date(item.updated_at).toLocaleString()}
        </Text>
      </View>
      {item.is_available && (
        <View style={styles.actionRow}>
          <Pressable
            style={[styles.actionBtn, styles.btnSuspend]}
            onPress={() => suspendDriver(item.user_id, item.display_name)}
          >
            <Text style={styles.actionBtnText}>Suspend</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  const RIDE_STATUS_COLOR: Record<string, string> = {
    searching:  '#fef9c3',
    requested:  '#dbeafe',
    accepted:   '#d1fae5',
    in_progress:'#dcfce7',
    completed:  '#f0fdf4',
    declined:   '#fee2e2',
    expired:    '#fef2f2',
    cancelled:  '#fef2f2',
  };

  const renderRideItem = ({ item }: { item: RideRow }) => (
    <View style={[styles.card, { borderLeftWidth: 3, borderLeftColor: RIDE_STATUS_COLOR[item.status] ?? '#e2e8f0' }]}>
      <View style={styles.cardHeader}>
        <Text style={styles.mutedText}>{new Date(item.created_at).toLocaleString()}</Text>
        <View style={[styles.badge, { backgroundColor: RIDE_STATUS_COLOR[item.status] ?? '#f1f5f9' }]}>
          <Text style={styles.badgeText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.rideRoute} numberOfLines={1}>
        {item.pickup_address ?? '(pickup)'} → {item.dropoff_address ?? '(dropoff)'}
      </Text>
      <View style={styles.rideFooter}>
        <Text style={styles.mutedText}>P: {item.passenger_id?.slice(0, 8) ?? '—'}</Text>
        <Text style={styles.mutedText}>D: {item.driver_id?.slice(0, 8) ?? '—'}</Text>
        {item.kind_points != null && (
          <Text style={styles.pointsText}>+{item.kind_points} pts</Text>
        )}
      </View>
    </View>
  );

  // ── Stats bar ─────────────────────────────────────────────────────────────

  const activeSos = sosList.filter(s => s.status !== 'resolved').length;
  const onlineDrivers = drivers.filter(d => d.is_available).length;
  const recentRides = rides.filter(r =>
    Date.now() - new Date(r.created_at).getTime() < 24 * 60 * 60 * 1000
  ).length;

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>{t('close')}</Text>
        </Pressable>
        <Text style={styles.title}>Admin Panel</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* Stats bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, activeSos > 0 && styles.statValueAlert]}>{activeSos}</Text>
          <Text style={styles.statLabel}>Active SOS</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{onlineDrivers}</Text>
          <Text style={styles.statLabel}>Online Drivers</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{recentRides}</Text>
          <Text style={styles.statLabel}>Rides (24h)</Text>
        </View>
      </View>

      {/* Tab bar */}
      <TabBar active={activeTab} onSelect={setActiveTab} />

      {/* SOS tab */}
      {activeTab === 'sos' && (
        <FlatList
          data={sosList}
          keyExtractor={(item) => item.id}
          renderItem={renderSosItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={sosRefreshing}
              onRefresh={async () => { setSosRefreshing(true); await fetchSosRequests(); setSosRefreshing(false); }}
            />
          }
          ListEmptyComponent={<Text style={styles.emptyText}>{t('noSosRequestsFound')}</Text>}
        />
      )}

      {/* Drivers tab */}
      {activeTab === 'drivers' && (
        <FlatList
          data={drivers}
          keyExtractor={(item) => item.user_id}
          renderItem={renderDriverItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={driversRefreshing}
              onRefresh={async () => { setDriversRefreshing(true); await fetchDrivers(); setDriversRefreshing(false); }}
            />
          }
          ListHeaderComponent={
            <Text style={styles.tabHint}>
              {drivers.length} driver{drivers.length !== 1 ? 's' : ''} in presence table
              {' · '}{onlineDrivers} online
            </Text>
          }
          ListEmptyComponent={<Text style={styles.emptyText}>No drivers found.</Text>}
        />
      )}

      {/* Rides tab */}
      {activeTab === 'rides' && (
        <FlatList
          data={rides}
          keyExtractor={(item) => item.id}
          renderItem={renderRideItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={ridesRefreshing}
              onRefresh={async () => { setRidesRefreshing(true); await fetchRides(); setRidesRefreshing(false); }}
            />
          }
          ListHeaderComponent={
            <Text style={styles.tabHint}>Most recent 60 rides across all users</Text>
          }
          ListEmptyComponent={<Text style={styles.emptyText}>No rides found.</Text>}
        />
      )}

    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorTitle: { fontSize: 22, fontWeight: 'bold', color: '#991b1b', marginBottom: 8 },
  errorBody: { fontSize: 16, color: '#475569', textAlign: 'center', marginBottom: 20 },
  backBtn: { backgroundColor: '#2563eb', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  backBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, backgroundColor: '#fff',
    borderBottomWidth: 1, borderColor: '#e2e8f0',
  },
  closeBtn: { padding: 8 },
  closeBtnText: { color: '#2563eb', fontSize: 16, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: 'bold', color: '#0f172a' },

  // Stats bar
  statsBar: {
    flexDirection: 'row', backgroundColor: '#0f172a',
    paddingVertical: 14, paddingHorizontal: 16,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '800', color: '#ffffff' },
  statValueAlert: { color: '#f87171' },
  statLabel: { fontSize: 11, color: '#94a3b8', fontWeight: '600', marginTop: 2 },
  statDivider: { width: 1, backgroundColor: '#334155', marginVertical: 4 },

  // Tab bar
  tabBar: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderColor: '#e2e8f0',
  },
  tabItem: {
    flex: 1, alignItems: 'center', paddingVertical: 12, gap: 3,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabItemActive: { borderBottomColor: '#2563eb' },
  tabIcon: { fontSize: 16 },
  tabLabel: { fontSize: 11, fontWeight: '600', color: '#64748b' },
  tabLabelActive: { color: '#2563eb' },

  // Lists
  list: { padding: 16, gap: 12 },
  emptyText: { textAlign: 'center', color: '#64748b', marginTop: 40, fontSize: 15 },
  tabHint: {
    fontSize: 12, color: '#94a3b8', fontWeight: '500',
    marginBottom: 8, paddingHorizontal: 2,
  },

  // Cards
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 2,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  cardUrgent: { borderColor: '#fca5a5', backgroundColor: '#fef2f2' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  messageText: { fontSize: 15, color: '#0f172a', fontWeight: '600', marginBottom: 6 },
  metaText: { fontSize: 13, color: '#475569', marginBottom: 4 },
  mutedText: { fontSize: 12, color: '#94a3b8' },
  dateText: { fontSize: 12, color: '#64748b', fontWeight: '500' },

  // Badges
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeRed: { backgroundColor: '#fee2e2' },
  badgeYellow: { backgroundColor: '#fef9c3' },
  badgeGreen: { backgroundColor: '#dcfce7' },
  badgeGrey: { backgroundColor: '#f1f5f9' },
  badgeText: { fontSize: 10, fontWeight: 'bold', color: '#0f172a' },

  // Actions
  actionRow: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', marginTop: 12 },
  actionBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6 },
  btnAck: { backgroundColor: '#eab308' },
  btnResolve: { backgroundColor: '#10b981' },
  btnSuspend: { backgroundColor: '#ef4444' },
  actionBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },

  // Driver-specific
  driverMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  tierChip: {
    backgroundColor: '#eff6ff', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  tierText: { fontSize: 11, fontWeight: '700', color: '#2563eb' },

  // Ride-specific
  rideRoute: { fontSize: 14, color: '#0f172a', fontWeight: '500', marginBottom: 8 },
  rideFooter: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  pointsText: { fontSize: 12, fontWeight: '700', color: '#0d9488', marginLeft: 'auto' },
});
