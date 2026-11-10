import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { hydrate, useVisit, actions, isClosed, configureApi, backend, restoreApiSession, setApiToken } from '@mediflow/shared';
import { Brand, LangToggle, ThemeToggle, s, setMobileDarkMode, t } from './src/ui';
import { Login } from './src/Login';
import { Today } from './src/Today';
import { Appointments, Records, Profile } from './src/Tabs';
import { MorePage, PatientOverview, PrescriptionsPage, PrivacyPage, ResultsPage } from './src/Portal';

// Keep bearer credentials in the OS secure store. Patient/clinical data is fetched from the API.
configureApi({ baseUrl: process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:4000', tokenStore: {
  get: () => SecureStore.getItemAsync('mediflow.access-token'),
  set: value => value ? SecureStore.setItemAsync('mediflow.access-token', value) : SecureStore.deleteItemAsync('mediflow.access-token'),
} });

export default function App() {
  return <SafeAreaProvider><Root /></SafeAreaProvider>;
}

type Tab = 'overview' | 'journey' | 'appts' | 'more' | 'results' | 'prescriptions' | 'records' | 'profile' | 'privacy';
const THEME_KEY = 'mediflow.mobile.theme.v1';

function Root() {
  const { state: S, T } = useVisit();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('overview');
  const [dark, setDark] = useState(false);
  useEffect(() => {
    if (!S.signedIn) return;
    let active = true;
    const load = async () => {
      try {
        const [appointments, visits, trends, catalog, requests] = await Promise.all([backend.appointments(), backend.visits(), backend.trends(), backend.catalog(), backend.historyRequests()]);
        if (!active) return;
        actions.setServerAppointments(appointments.appointments); actions.setServerHistory(visits.visits); actions.setServerTrends(trends.readings); actions.setServerCatalog(catalog.items); actions.setServerHistoryRequests(requests.requests);
        const visit = visits.visits.find(item => item.status === 'active');
        if (visit) actions.setServerVisit((await backend.visit(visit.id)).visit);
        else if (S.serverVisitId) actions.setServerVisit(null);
      } catch (error) { console.error('Could not refresh patient data:', error); }
    };
    void load(); const timer = setInterval(() => void load(), 12000);
    return () => { active = false; clearInterval(timer); };
  }, [S.signedIn]);
  useEffect(() => { void (async () => {
    await hydrate();
    if (await restoreApiSession()) {
      try { const user = await backend.me(); if (user.role !== 'patient') throw new Error('Staff login requires the web app.'); actions.setServerIdentity(user); }
      catch { await setApiToken(null); }
    }
  })(); void AsyncStorage.getItem(THEME_KEY).then(value => setDark(value === 'dark')).catch(() => {}); }, []);
  useEffect(() => { void AsyncStorage.setItem(THEME_KEY, dark ? 'dark' : 'light').catch(() => {}); }, [dark]);
  setMobileDarkMode(dark);

  if (!S.hydrated) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}><StatusBar style={dark ? 'light' : 'dark'} /><Text style={{ color: t.inkSoft }}>Loading…</Text></View>;
  if (!S.signedIn) return <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: t.bg }}><StatusBar style={dark ? 'light' : 'dark'} /><Login dark={dark} onToggleTheme={() => setDark(value => !value)} /></View>;

  const openSymptoms = () => { if (!S.routeId || isClosed(S)) actions.chooseRoute('walk-in'); setTab('journey'); };
  const activeTab: Tab = ['results', 'prescriptions', 'records', 'profile', 'privacy'].includes(tab) ? 'more' : tab;
  const nav = [
    { id: 'overview' as const, label: T('nav.overview'), icon: '▦' },
    { id: 'journey' as const, label: T('nav.journey'), icon: '⌁' },
    { id: 'appts' as const, label: T('tab.appts'), icon: '▣' },
    { id: 'more' as const, label: T('nav.more'), icon: '•••' },
  ];

  return <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: t.bg }}>
    <StatusBar style={dark ? 'light' : 'dark'} />
    <View style={{ backgroundColor: t.card, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 11, borderBottomWidth: 1, borderBottomColor: t.line, gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <View><Brand /><Text style={{ color: t.inkSoft, fontSize: 10, marginTop: 5 }}>{T('nav.workspace')}</Text></View>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><ThemeToggle dark={dark} onToggle={() => setDark(value => !value)} /><LangToggle /></View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1 }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: t.primarySoft }}><Text style={{ color: t.primaryDark, fontSize: 12, fontWeight: '800' }}>{S.patient.initials}</Text></View>
          <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: t.ink, fontWeight: '800', fontSize: 12 }}>{S.patient.name}</Text><Text numberOfLines={1} style={{ color: t.inkSoft, fontSize: 10 }}>{T('nav.patient')} · {S.patient.hospitalNo}</Text></View>
        </View>
        <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
          <Pressable accessibilityRole="button" accessibilityLabel={T('nav.notifications')} onPress={() => setTab('journey')} style={{ minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: t.bg }}>
            <Text style={{ color: t.ink, fontSize: 17 }}>♧{S.notices.length ? ` ${S.notices.length}` : ''}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={T('btn.logout')} onPress={() => { void backend.logout().catch(() => {}).finally(() => { void setApiToken(null); actions.signOut(); }); }} style={{ minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: t.inkSoft, fontSize: 12 }}>↪</Text></Pressable>
        </View>
      </View>
    </View>

    <View style={{ flex: 1 }}>
      {tab === 'overview' && <PatientOverview onSymptoms={openSymptoms} onAppointments={() => setTab('appts')} onJourney={() => setTab('journey')} onResults={() => setTab('results')} onPrescriptions={() => setTab('prescriptions')} onRecords={() => setTab('records')} />}
      {tab === 'journey' && <Today bottom={insets.bottom} goAppointments={() => setTab('appts')} />}
      {tab === 'appts' && <Appointments goToday={() => setTab('journey')} />}
      {tab === 'results' && <ResultsPage onJourney={() => setTab('journey')} />}
      {tab === 'prescriptions' && <PrescriptionsPage onJourney={() => setTab('journey')} />}
      {tab === 'records' && <Records onProfile={() => setTab('profile')} />}
      {tab === 'profile' && <Profile />}
      {tab === 'privacy' && <PrivacyPage onRecords={() => setTab('records')} />}
      {tab === 'more' && <MorePage onResults={() => setTab('results')} onPrescriptions={() => setTab('prescriptions')} onRecords={() => setTab('records')} onPrivacy={() => setTab('privacy')} />}
    </View>

    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: t.card, borderTopWidth: 1, borderTopColor: t.line, paddingBottom: insets.bottom }}>
      {nav.map(item => <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: activeTab === item.id }} onPress={() => setTab(item.id)}
        style={{ flex: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: 3, borderTopWidth: 3, borderTopColor: activeTab === item.id ? t.primaryDark : 'transparent' }}>
        <Text style={{ color: activeTab === item.id ? t.primaryDark : t.inkSoft, fontSize: 16, lineHeight: 18 }}>{item.icon}</Text>
        <Text numberOfLines={1} style={{ fontSize: 10, fontWeight: activeTab === item.id ? '800' : '600', color: activeTab === item.id ? t.primaryDark : t.inkSoft }}>{item.label}</Text>
      </Pressable>)}
    </View>
  </View>;
}
