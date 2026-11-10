import { type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { config, useVisit } from '@mediflow/shared';

type Palette = typeof config.theme;
const lightPalette: Palette = { ...config.theme, primary: '#2874ff', primaryDark: '#245fc1', primarySoft: '#eaf2ff' };
const darkPalette: Palette = {
  ...lightPalette,
  primary: '#69a9ff', primaryDark: '#8bc1ff', primarySoft: '#1c3550',
  ink: '#e4edf2', inkSoft: '#afc0c9', bg: '#0e1820', card: '#17252f', line: '#31444f',
  warn: '#f0b65e', warnText: '#f0c989', warnSoft: '#403724', danger: '#ff9292', dangerSoft: '#482d36',
  success: '#65d08c', successText: '#a5e6b6', successSoft: '#183d2d', dark: '#132633',
};
let darkMode = false;
let palette: Palette = lightPalette;
export const t = new Proxy(config.theme, {
  get: (_target, property: string | symbol) => typeof property === 'string' ? palette[property as keyof Palette] : undefined,
}) as Palette;

export function setMobileDarkMode(enabled: boolean) {
  if (darkMode === enabled) return;
  darkMode = enabled;
  palette = enabled ? darkPalette : lightPalette;
  currentStyles = makeStyles();
}
export function ThemeToggle({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  const { T } = useVisit();
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: dark }} accessibilityLabel={T(dark ? 'theme.switchLight' : 'theme.switchDark')} onPress={onToggle}
    style={{ minHeight: 40, paddingHorizontal: 10, borderWidth: 1, borderColor: t.line, borderRadius: 10, backgroundColor: t.card, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ color: t.ink, fontSize: 12, fontWeight: '700' }}>{dark ? '☀' : '☾'} {T(dark ? 'theme.light' : 'theme.dark')}</Text>
  </Pressable>;
}

export function Btn({ label, onPress, disabled, kind = 'primary' }: { label: string; onPress: () => void; disabled?: boolean; kind?: 'primary' | 'ghost' | 'dark' | 'danger' }) {
  const bg = kind === 'ghost' ? t.card : kind === 'dark' ? t.dark : kind === 'danger' ? t.danger : t.primaryDark;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} onPress={onPress} disabled={disabled}
      style={[s.btn, { backgroundColor: bg, borderWidth: kind === 'ghost' ? 1 : 0, borderColor: t.line, opacity: disabled ? 0.5 : 1 }]}>
      <Text style={[s.btnText, kind === 'ghost' && { color: t.ink }]}>{label}</Text>
    </Pressable>
  );
}
export const LinkBtn = ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => (
  <Pressable accessibilityRole="link" onPress={onPress} disabled={disabled} style={{ minHeight: 44, justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}>
    <Text style={{ color: t.inkSoft, textDecorationLine: 'underline' }}>{label}</Text></Pressable>
);
export function Note({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'danger' | 'ok'; children: ReactNode }) {
  const m = { info: [t.primarySoft, t.primaryDark], warn: [t.warnSoft, t.warnText], danger: [t.dangerSoft, t.danger], ok: [t.successSoft, t.successText] }[tone];
  return <View accessibilityRole={tone === 'danger' ? 'alert' : undefined} style={[s.note, { backgroundColor: m[0] }]}><Text style={{ color: m[1], fontSize: 14 }}>{children}</Text></View>;
}
export const KV = ({ k, v, danger }: { k: string; v: string; danger?: boolean }) => (
  <View style={s.kv}><Text style={s.kvK}>{k.toUpperCase()}</Text><Text style={[s.kvV, danger && { color: t.danger }]}>{v}</Text></View>
);
export const Eyebrow = ({ children }: { children: ReactNode }) => <Text style={s.eyebrow}>{String(children).toUpperCase()}</Text>;
export const H1 = ({ children }: { children: ReactNode }) => <Text accessibilityRole="header" style={s.h1}>{children}</Text>;
export const Muted = ({ children }: { children: ReactNode }) => <Text style={s.muted}>{children}</Text>;
export const Card = ({ children, dark }: { children: ReactNode; dark?: boolean }) => <View style={[s.card, dark && { backgroundColor: t.dark }]}>{children}</View>;
export const Pill = ({ tone = 'ok', text }: { tone?: 'ok' | 'warn'; text: string }) => (
  <Text style={{ backgroundColor: tone === 'ok' ? t.successSoft : t.warnSoft, color: tone === 'ok' ? t.successText : t.warnText, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3, fontSize: 12, fontWeight: '700', overflow: 'hidden' }}>{text}</Text>
);
export function Bar({ pct }: { pct: number }) {
  return <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }} style={s.bar}><View style={[s.barFill, { width: `${pct}%` }]} /></View>;
}
export function Field({ label, error, ...rest }: { label: string; error?: string | null } & TextInputProps) {
  return (<View><Text style={s.label}>{label}</Text>
    <TextInput accessibilityLabel={label} style={[s.input, error ? { borderColor: t.danger, backgroundColor: t.dangerSoft } : null]} {...rest} />
    {error ? <Text style={{ color: t.danger, fontSize: 13, marginTop: 4 }}>{error}</Text> : null}</View>);
}
export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={onPress} style={[s.chip, on && { backgroundColor: t.dark, borderColor: t.dark }]}><Text style={{ color: on ? '#fff' : t.ink, fontWeight: '600' }}>{label}</Text></Pressable>;
}
export function Check({ label, sub, price, on, onPress }: { label: string; sub?: string; price: string; on: boolean; onPress: () => void }) {
  return (<Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={onPress} style={s.check}>
    <View style={[s.box, on && { backgroundColor: t.primaryDark, borderColor: t.primaryDark }]}>{on && <Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text>}</View>
    <View style={{ flex: 1 }}><Text style={{ color: t.ink, fontWeight: '600' }}>{label}</Text>{sub ? <Text style={{ color: t.inkSoft, fontSize: 12 }}>{sub}</Text> : null}</View>
    <Text style={{ fontWeight: '800', color: t.ink }}>{price}</Text></Pressable>);
}
export function LangToggle() {
  const { state, actions } = useVisit();
  return (<View style={{ flexDirection: 'row', borderWidth: 1, borderColor: t.line, borderRadius: 8, overflow: 'hidden' }}>
    {(['en', 'sw'] as const).map(l => (
      <Pressable key={l} accessibilityRole="button" accessibilityState={{ selected: state.lang === l }} onPress={() => actions.setLang(l)}
        style={{ minWidth: 40, minHeight: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: state.lang === l ? t.dark : t.card }}>
        <Text style={{ fontWeight: '700', color: state.lang === l ? '#fff' : t.inkSoft }}>{l.toUpperCase()}</Text></Pressable>))}
  </View>);
}
export function Brand() {
  return (<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
    <View style={s.logo}><Text style={{ color: '#fff', fontWeight: '800' }}>+</Text></View>
    <View><Text style={{ fontWeight: '800', color: t.ink }}>{config.hospital.name}</Text>
      <Text style={{ fontSize: 9, letterSpacing: 1.4, color: t.inkSoft }}>{config.hospital.tagline.toUpperCase()}</Text></View></View>);
}
/** Human help is always one tap away: call or WhatsApp. */
export function HelpMenu() {
  const { T } = useVisit();
  return (<View style={{ flexDirection: 'row', gap: 8 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={T('help.call')} onPress={() => Linking.openURL(`tel:${config.hospital.supportPhone.replace(/\s/g, '')}`)} style={s.helpBtn}><Text style={s.helpTxt}>{T('help.title')}</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={T('help.whatsapp')} onPress={() => Linking.openURL(`https://wa.me/${config.hospital.whatsapp}`)} style={s.helpBtn}><Text style={s.helpTxt}>WhatsApp</Text></Pressable>
  </View>);
}

function makeStyles() {
  return StyleSheet.create({
    btn: { borderRadius: 12, minHeight: 48, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
    btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    note: { borderRadius: 12, padding: 12, marginVertical: 10 },
    kv: { borderWidth: 1, borderColor: palette.line, borderRadius: 10, padding: 11, marginBottom: 8, backgroundColor: palette.card },
    kvK: { fontSize: 10, letterSpacing: 1, color: palette.inkSoft }, kvV: { fontSize: 14, fontWeight: '800', color: palette.ink, marginTop: 2 },
    eyebrow: { fontSize: 10, letterSpacing: 1.3, color: palette.primaryDark, fontWeight: '800', marginBottom: 6 },
    h1: { fontSize: 24, fontWeight: '800', color: palette.ink, marginBottom: 4 }, h2: { fontSize: 18, fontWeight: '800', color: palette.ink },
    muted: { color: palette.inkSoft, fontSize: 13, marginBottom: 12, lineHeight: 19 },
    card: { backgroundColor: palette.card, borderRadius: 16, borderWidth: 1, borderColor: palette.line, padding: 18, marginBottom: 12 },
    label: { fontSize: 12, fontWeight: '700', color: palette.ink, marginTop: 12, marginBottom: 5 },
    input: { borderWidth: 1, borderColor: palette.line, borderRadius: 10, minHeight: 48, paddingHorizontal: 12, backgroundColor: palette.card, color: palette.ink },
    bar: { height: 8, backgroundColor: palette.line, borderRadius: 99, overflow: 'hidden', marginTop: 8 }, barFill: { height: 8, backgroundColor: palette.primaryDark },
    chip: { borderWidth: 1, borderColor: palette.line, borderRadius: 99, paddingHorizontal: 16, minHeight: 44, justifyContent: 'center', backgroundColor: palette.card },
    check: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: palette.line },
    box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: palette.line, alignItems: 'center', justifyContent: 'center' },
    logo: { width: 32, height: 32, borderRadius: 9, backgroundColor: palette.primaryDark, alignItems: 'center', justifyContent: 'center' },
    helpBtn: { minHeight: 36, paddingHorizontal: 10, justifyContent: 'center', borderRadius: 8, backgroundColor: palette.primarySoft }, helpTxt: { color: palette.primaryDark, fontWeight: '700', fontSize: 12 },
    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  });
}
let currentStyles = makeStyles();
export const s = new Proxy({} as ReturnType<typeof makeStyles>, {
  get: (_target, property: string | symbol) => typeof property === 'string' ? currentStyles[property as keyof ReturnType<typeof makeStyles>] : undefined,
});
