import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Plus, RefreshCw, LogOut, Pencil, LockKeyhole, TreeDeciduous, Download, Search, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { configured, supabase as sb, Asset, Quote, Member, rp, quoteFor, totals, label, dateText, callMarket, download } from '@/lib/cloud';
import { averageEntry, calculateAverageDown, calculateOpeningBuy } from '@/lib/position';
const colors = ['#b8d49a', '#62a98b', '#d9d9bb', '#a393c3', '#73b3c2', '#c8a977'];
const percent = (g: number, c: number) => c > 0 ? `${g >= 0 ? '+' : ''}${(100 * g / c).toFixed(2)}%` : '—';
type PurchaseDraft = {
    amount: number;
    fee: number;
    price: number;
};
const unitsText = (value: number) => value > 0 ? value.toLocaleString('id-ID', { maximumFractionDigits: 12 }) : '—';
function PositionCalculator({ asset, purchase, marketPrice, priceBusy, onPurchase, onPreview, onApply, onManual }: {
    asset: Asset;
    purchase: PurchaseDraft;
    marketPrice: number | null;
    priceBusy: boolean;
    onPurchase: (next: PurchaseDraft) => void;
    onPreview: () => void;
    onApply: () => void;
    onManual: (qty: number, cost: number) => void;
}) {
    const existing = Boolean(asset.version);
    const calc = existing
        ? calculateAverageDown(asset.qty, asset.cost, purchase.amount, purchase.fee, purchase.price, asset.provider)
        : calculateOpeningBuy(purchase.amount, purchase.fee, purchase.price, asset.provider);
    const addedUnits = existing ? Math.max(0, calc.units - asset.qty) : calc.units;
    const canPreview = ['coingecko', 'twelve', 'yahoo'].includes(asset.provider) && Boolean(asset.provider_id);
    const validBuy = purchase.amount > 0 && purchase.price > 0 && purchase.fee >= 0 && purchase.fee < purchase.amount && addedUnits > 0;
    const change = (key: keyof PurchaseDraft, value: number) => onPurchase({ ...purchase, [key]: Number.isFinite(value) ? value : 0 });
    return <section className="position-calculator">
        <div className="position-title">
<div>
<strong>{existing ? 'Tambah pembelian / average down' : 'Catat pembelian awal'}
</strong>
<small>{existing ? 'Masukkan transaksi baru; posisi dan average akan dihitung ulang.' : 'Nominal rupiah dikonversi otomatis menjadi unit.'}
</small>
</div>{canPreview && <button type="button" className="outline compact" disabled={priceBusy} onClick={onPreview}>
<RefreshCw size={13}/>{priceBusy ? 'Mengambil…' : 'Pakai harga pasar'}
</button>}
</div>
        {existing && <div className="position-strip">
<span>Posisi sekarang<strong>{unitsText(asset.qty)} unit</strong>
</span>
<span>Modal<strong>{rp(asset.cost)}
</strong>
</span>
<span>Avg efektif<strong>{rp(averageEntry(asset.qty, asset.cost))}
</strong>
</span>
</div>}
        <div className="fields transaction-fields">
<label>Total dana termasuk fee (Rp)<input type="number" min="0" step="any" value={purchase.amount || ''} onChange={e => change('amount', Number(e.target.value))}/>
</label>
<label>Harga beli / avg broker per unit (Rp)<input type="number" min="0.000000000001" step="any" value={purchase.price || ''} onChange={e => change('price', Number(e.target.value))}/>
</label>
<label>Fee transaksi (Rp)<input type="number" min="0" step="any" value={purchase.fee || ''} onChange={e => change('fee', Number(e.target.value))}/>
</label>
<label>Referensi harga API<input readOnly value={marketPrice ? rp(marketPrice) : 'Belum diambil'}/>
</label>
</div>
        <p className="field-help">Harga API hanya referensi. Untuk angka portofolio yang akurat, cocokkan harga beli dan fee dengan riwayat transaksi broker/exchange.</p>
        <div className="calculation-preview">
<span>{existing ? 'Unit tambahan' : 'Unit otomatis'}
<strong>{unitsText(addedUnits)}
</strong>
</span>
<span>{existing ? 'Total unit baru' : 'Modal tercatat'}
<strong>{existing ? unitsText(calc.units) : rp(calc.totalCost)}
</strong>
</span>
<span>{existing ? 'Average baru incl. fee' : 'Average efektif incl. fee'}
<strong>{calc.effectiveAverage > 0 ? rp(calc.effectiveAverage) : '—'}
</strong>
</span>
</div>
        {asset.provider === 'yahoo' && <p className="lot-note">Saham IDX otomatis dibulatkan ke bawah per 1 lot = 100 lembar. Selisih dana dianggap tidak terpakai.</p>}
        {existing && <button type="button" className="primary apply-buy" disabled={!validBuy} onClick={onApply}>Terapkan pembelian ke posisi</button>}
        {existing && <details className="manual-correction">
<summary>Koreksi posisi secara manual</summary>
<div className="fields">
<label>Total unit / lembar<input type="number" min="0.000000000001" step="any" value={asset.qty} onChange={e => onManual(Number(e.target.value), asset.cost)}/>
</label>
<label>Total modal + fee (Rp)<input type="number" min="0" step="any" value={asset.cost} onChange={e => onManual(asset.qty, Number(e.target.value))}/>
</label>
</div>
</details>}
    </section>;
}
function Brand() { return <a className="brand" href="./">
<img src="./assets/arbor-logo.png" alt="Logo pohon Arbor Capital"/>
<span>ARBOR CAPITAL<small>FAMILY OFFICE</small>
</span>
</a>; }
function Auth({ recovery, onRecovered }: {
    recovery: boolean;
    onRecovered: () => void;
}) {
    const [mode, setMode] = useState('login'), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true);
        setMessage('');
        try {
            let r: any;
            const redirect = location.origin + location.pathname;
            if (recovery) {
                r = await sb!.auth.updateUser({ password });
                if (!r.error) {
                    onRecovered();
                    setMessage('Kata sandi berhasil diganti.');
                }
            }
            else if (mode === 'signup') {
                r = await sb!.auth.signUp({ email, password, options: { emailRedirectTo: redirect } });
                if (!r.error)
                    setMessage('Cek email untuk konfirmasi. Setelah itu, admin perlu menyetujui akun Anda.');
            }
            else if (mode === 'reset') {
                r = await sb!.auth.resetPasswordForEmail(email, { redirectTo: redirect });
                if (!r.error)
                    setMessage('Jika email terdaftar, tautan pemulihan akan dikirim.');
            }
            else
                r = await sb!.auth.signInWithPassword({ email, password });
            if (r.error)
                throw r.error;
        }
        catch (e) {
            setMessage((e as Error).message);
        }
        finally {
            setBusy(false);
        }
    }
    return <div className="auth-wrap">
<Brand />
<div className="panel auth-card">
<div className="eyebrow">PRIVATE FAMILY OFFICE</div>
<h1>{recovery ? 'Kata sandi baru' : mode === 'signup' ? 'Buat akun.' : mode === 'reset' ? 'Pulihkan akun.' : 'Welcome back.'}
</h1>
<p>Portofolio hanya tersedia untuk akun yang telah disetujui.</p>
<form onSubmit={submit}>{!recovery && <label>Email<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)}/>
</label>}{(recovery || mode !== 'reset') && <label>Kata sandi<input type="password" required minLength={mode === 'signup' || recovery ? 12 : 1} autoComplete={mode === 'signup' || recovery ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)}/>
</label>}
<button disabled={busy} className="primary save">{busy ? 'Memproses…' : recovery ? 'Simpan kata sandi' : mode === 'login' ? 'Masuk' : mode === 'signup' ? 'Daftar akun' : 'Kirim tautan'}
</button>
</form>{message && <p role="status" className="message">{message}
</p>}{!recovery && <div className="auth-links">
<button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage(''); }}>{mode === 'login' ? 'Belum punya akun? Daftar' : 'Sudah punya akun? Masuk'}
</button>
<button onClick={() => { setMode('reset'); setMessage(''); }}>Lupa kata sandi</button>
</div>}
</div>
</div>;
}
export default function App() {
    const [session, setSession] = useState<Session | null>(null), [authReady, setAuthReady] = useState(false), [recovery, setRecovery] = useState(false), [member, setMember] = useState<Member | null>(null), [assets, setAssets] = useState<Asset[]>([]), [quotes, setQuotes] = useState<Quote[]>([]), [members, setMembers] = useState<Member[]>([]), [audit, setAudit] = useState<any[]>([]), [error, setError] = useState(''), [notice, setNotice] = useState(''), [loading, setLoading] = useState(false), [refreshing, setRefreshing] = useState(false), [checked, setChecked] = useState(''), [draft, setDraft] = useState<Asset | null>(null), [saving, setSaving] = useState(false), [query, setQuery] = useState(''), [results, setResults] = useState<any[]>([]), [searching, setSearching] = useState(false), [importRows, setImportRows] = useState<Asset[] | null>(null), [purchase, setPurchase] = useState<PurchaseDraft>({ amount: 0, fee: 0, price: 0 }), [marketPrice, setMarketPrice] = useState<number | null>(null), [priceBusy, setPriceBusy] = useState(false), [deleteConfirm, setDeleteConfirm] = useState('');
    const refreshLock = useRef(false);
    const editor = ['editor', 'admin'].includes(member?.role || '');
    const approved = ['viewer', 'editor', 'admin'].includes(member?.role || '');
    useEffect(() => {
        if (!sb) {
            setAuthReady(true);
            return;
        }
        sb.auth.getSession().then(({ data, error }) => {
            if (error)
                setError(error.message);
            setSession(data.session);
            setAuthReady(true);
        });
        const { data } = sb.auth.onAuthStateChange((event, s) => {
            setSession(s);
            if (event === 'PASSWORD_RECOVERY')
                setRecovery(true);
            if (!s) {
                setMember(null);
                setAssets([]);
                setQuotes([]);
                setMembers([]);
                setAudit([]);
            }
        });
        return () => data.subscription.unsubscribe();
    }, []);
    const load = useCallback(async () => {
        if (!sb || !session)
            return;
        const { data: me, error: meError } = await sb.from('memberships').select('*').eq('user_id', session.user.id).single();
        if (meError)
            throw meError;
        setMember(me);
        if (!['viewer', 'editor', 'admin'].includes(me.role)) {
            setAssets([]);
            setQuotes([]);
            setMembers([]);
            setAudit([]);
            return;
        }
        const [a, q] = await Promise.all([sb.from('assets').select('*').order('updated_at'), sb.from('quotes').select('*')]);
        if (a.error || q.error)
            throw a.error || q.error;
        setAssets(a.data as Asset[]);
        setQuotes(q.data as Quote[]);
        if (me.role === 'admin') {
            const [m, l] = await Promise.all([sb.from('memberships').select('*').order('created_at'), sb.from('audit_log').select('*').order('at', { ascending: false }).limit(50)]);
            if (m.error || l.error)
                throw m.error || l.error;
            setMembers(m.data);
            setAudit(l.data);
        }
        else {
            setMembers([]);
            setAudit([]);
        }
    }, [session?.user.id]);
    useEffect(() => {
        if (!session)
            return;
        setLoading(true);
        load().catch(e => setError(e.message)).finally(() => setLoading(false));
        const timer = setInterval(() => {
            if (!document.hidden)
                load().catch(e => setError(e.message));
        }, 30000);
        return () => clearInterval(timer);
    }, [load, session?.user.id]);
    const refresh = useCallback(async () => {
        if (!approved || refreshLock.current || document.hidden)
            return;
        refreshLock.current = true;
        setRefreshing(true);
        try {
            const d = await callMarket('refresh');
            setChecked(new Date().toISOString());
            await load();
            if (d.failed)
                setNotice(`${d.failed} harga belum berhasil diperbarui. Lihat status masing-masing aset.`);
            else if (d.updated)
                setNotice(`${d.updated} harga diperbarui.`);
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setRefreshing(false);
            refreshLock.current = false;
        }
    }, [approved, load]);
    useEffect(() => {
        if (!approved)
            return;
        refresh();
        const timer = setInterval(refresh, 60000);
        const visible = () => {
            if (!document.hidden)
                refresh();
        };
        document.addEventListener('visibilitychange', visible);
        return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
    }, [approved, refresh]);
    async function logout() {
        const { error } = await sb!.auth.signOut();
        if (error)
            setError(error.message);
    }
    async function save(e: React.FormEvent) {
        e.preventDefault();
        if (!draft)
            return;
        setSaving(true);
        setError('');
        try {
            if (!(Number(draft.qty) > 0) || !(Number(draft.cost) > 0))
                throw Error('Isi nominal pembelian dan harga beli agar jumlah unit dapat dihitung.');
            const item = draft.provider === 'yahoo' ? { ...draft, symbol: draft.symbol.trim().toUpperCase().replace(/\.JK$/, ''), provider_id: (draft.provider_id || draft.symbol).trim().toUpperCase().replace(/\.JK$/, '') + '.JK', exchange: 'XIDX', currency: 'IDR', category: draft.category === 'Aset digital' ? 'Saham Indonesia' : draft.category } : draft;
            const { error } = await sb!.rpc('save_asset', { item, expected_version: draft.version ?? null });
            if (error)
                throw error;
            setDraft(null);
            setNotice('Aset tersimpan. Unit, average entry, nilai sekarang, dan P/L telah dihitung ulang.');
            await load();
            await refresh();
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setSaving(false);
        }
    }
    function add() { setError(''); setResults([]); setQuery(''); setDeleteConfirm(''); setPurchase({ amount: 0, fee: 0, price: 0 }); setMarketPrice(null); setDraft({ id: crypto.randomUUID(), symbol: '', name: '', category: 'Aset digital', broker: '', qty: 0, cost: 0, provider: 'coingecko', provider_id: '', exchange: '', currency: 'IDR', note: '' }); }
    function edit(a: Asset) { setError(''); setResults([]); setDeleteConfirm(''); const q = quoteFor(a, quotes); setPurchase({ amount: 0, fee: 0, price: Number(q?.price_idr || 0) }); setMarketPrice(q?.price_idr == null ? null : Number(q.price_idr)); setDraft({ ...a, manual_price: q?.price_idr ?? undefined, manual_as_of: q?.as_of ?? new Date().toISOString() }); }
    async function previewPrice(asset: Asset) {
        if (!asset.provider_id || !['coingecko', 'twelve', 'yahoo'].includes(asset.provider))
            return;
        setPriceBusy(true);
        setError('');
        try {
            const normalized = asset.provider === 'yahoo' ? { ...asset, provider_id: (asset.provider_id || asset.symbol).trim().toUpperCase().replace(/\.JK$/, '') + '.JK', exchange: 'XIDX', currency: 'IDR' } : asset;
            const d = await callMarket('preview', { asset: { provider: normalized.provider, provider_id: normalized.provider_id, exchange: normalized.exchange, currency: normalized.currency } });
            const price = Number(d.price?.price_idr);
            if (!Number.isFinite(price) || price <= 0)
                throw Error('Harga referensi belum tersedia.');
            setMarketPrice(price);
            setPurchase(p => {
                const next = { ...p, price };
                if (!asset.version) {
                    const calc = calculateOpeningBuy(next.amount, next.fee, next.price, asset.provider);
                    setDraft(current => current ? { ...current, qty: calc.units, cost: calc.totalCost } : current);
                }
                return next;
            });
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setPriceBusy(false);
        }
    }
    async function chooseResult(result: Partial<Asset>) {
        if (!draft)
            return;
        const next = { ...draft, ...result } as Asset;
        setDraft(next);
        setResults([]);
        setMarketPrice(null);
        setPurchase(p => ({ ...p, price: 0 }));
        await previewPrice(next);
    }
    function updatePurchase(next: PurchaseDraft) {
        setPurchase(next);
        if (!draft || draft.version)
            return;
        const calc = calculateOpeningBuy(next.amount, next.fee, next.price, draft.provider);
        setDraft({ ...draft, qty: calc.units, cost: calc.totalCost });
    }
    function applyAverageDown() {
        if (!draft || !draft.version)
            return;
        const calc = calculateAverageDown(draft.qty, draft.cost, purchase.amount, purchase.fee, purchase.price, draft.provider);
        if (calc.units <= draft.qty)
            return;
        setDraft({ ...draft, qty: calc.units, cost: calc.totalCost });
        setPurchase({ amount: 0, fee: 0, price: marketPrice || purchase.price });
        setNotice('Pembelian diterapkan ke draft. Klik Simpan aset untuk menyimpan posisi baru.');
    }
    async function removeAsset() {
        if (!draft?.version)
            return;
        const symbol = draft.symbol.trim().toUpperCase();
        if (deleteConfirm.trim().toUpperCase() !== symbol) {
            setError(`Ketik ${symbol} untuk mengonfirmasi penghapusan.`);
            return;
        }
        if (!window.confirm(`Hapus ${symbol} dari portofolio? Tindakan ini tidak dapat dibatalkan dari website.`))
            return;
        setSaving(true);
        setError('');
        try {
            await callMarket('delete', { asset_id: draft.id, expected_version: draft.version, confirmation: symbol });
            setDraft(null);
            setDeleteConfirm('');
            setNotice(`${symbol} berhasil dihapus dari portofolio.`);
            await load();
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setSaving(false);
        }
    }
    async function search() {
        if (!draft)
            return;
        setSearching(true);
        setError('');
        try {
            const d = await callMarket('search', { provider: draft.provider, query });
            setResults(d.results);
            if (!d.results.length)
                setNotice('Tidak ada instrumen yang cocok. Coba nama lengkap atau ticker.');
        }
        catch (e) {
            setError((e as Error).message);
        }
        finally {
            setSearching(false);
        }
    }
    async function role(user: string, value: string) {
        setError('');
        try {
            const { error } = await sb!.rpc('set_member_role', { target_user: user, new_role: value });
            if (error)
                throw error;
            await load();
            setNotice('Hak akses diperbarui.');
        }
        catch (e) {
            setError((e as Error).message);
        }
    }
    async function readImport(file: File | undefined) {
        if (!file)
            return;
        try {
            if (file.size > 1000000)
                throw Error('File maksimal 1 MB.');
            const d = JSON.parse(await file.text());
            if (d.format !== 'arbor-cloud-v2' || !Array.isArray(d.assets) || d.assets.length > 100)
                throw Error('Gunakan backup Arbor Cloud v2 atau file PRIVATE yang disertakan.');
            const rows = d.assets.map((a: any) => {
                if (!a.symbol || !a.name || !['manual', 'custom', 'coingecko', 'twelve', 'yahoo'].includes(a.provider))
                    throw Error('Format aset tidak valid.');
                const existing = assets.find(x => x.id === a.id);
                return { ...a, version: existing?.version };
            });
            setImportRows(rows);
            setError('');
        }
        catch (e) {
            setError((e as Error).message);
        }
    }
    async function doImport() {
        if (!importRows)
            return;
        setSaving(true);
        try {
            for (const item of importRows) {
                const { error } = await sb!.rpc('save_asset', { item, expected_version: item.version ?? null });
                if (error)
                    throw error;
            }
            setImportRows(null);
            setNotice('Impor selesai. Harga otomatis akan mengikuti API.');
            await load();
            await refresh();
        }
        catch (e) {
            setError('Impor berhenti: ' + (e as Error).message + '. Sebagian aset mungkin sudah tersimpan; muat ulang sebelum mencoba lagi.');
            setImportRows(null);
            await load();
        }
        finally {
            setSaving(false);
        }
    }
    function backup() { download('Arbor-Capital-Cloud-Backup.json', { format: 'arbor-cloud-v2', exportedAt: new Date().toISOString(), assets: assets.map(a => { const q = quoteFor(a, quotes); return { ...a, manual_price: a.provider === 'manual' ? q?.price_idr : undefined, manual_as_of: a.provider === 'manual' ? q?.as_of : undefined }; }), quotes }); }
    if (!configured)
        return <div className="auth-wrap">
<Brand />
<section className="panel auth-card">
<h1>Hubungkan Arbor.</h1>
<p>Backend belum diaktifkan. Isi URL Supabase dan publishable key di <code>docs/config.js</code>, jalankan SQL, lalu deploy fungsi harga sesuai panduan.</p>
<p>Data portofolio tidak dimasukkan ke file publik. Setelah login sebagai admin, impor file PRIVATE lewat dashboard.</p>
<p>Jangan masukkan service-role key atau API key pasar ke config frontend.</p>
</section>
</div>;
    if (!authReady)
        return <div className="loading">Memeriksa sesi…</div>;
    if (!session || recovery)
        return <Auth recovery={recovery} onRecovered={() => setRecovery(false)}/>;
    const t = totals(assets, quotes);
    let angle = 0;
    const gradient = assets.map((a, i) => { const start = angle; const price = quoteFor(a, quotes)?.price_idr; angle += t.value && price != null ? a.qty * price / t.value * 100 : 0; return `${colors[i % 6]} ${start}% ${angle}%`; }).join(',');
    return <div className="shell">
<header>
<Brand />
<div className="header-right">
<span className="private">
<LockKeyhole size={13}/>{member?.role || 'Memuat akses'}
</span>
<button className="outline" onClick={logout}>
<LogOut size={15}/>Keluar</button>
</div>
</header>
<main>{!approved ? <section className="panel auth-card">
<h1>{member?.role === 'blocked' ? 'Akses dinonaktifkan.' : 'Menunggu persetujuan.'}
</h1>
<p>{session.user.email}
</p>
<p>Admin perlu memberikan akses sebelum portofolio dapat dilihat atau diedit.</p>
<button className="outline" onClick={() => load().catch(e => setError(e.message))}>Periksa akses</button>{error && <p className="negative" role="alert">{error}
</p>}
</section> : <>
<div className="heading">
<div>
<div className="eyebrow">A LONGER HORIZON</div>
<h1>Portfolio overview<span>.</span>
</h1>
<p>Berakar pada disiplin. Bertumbuh untuk masa depan.</p>
</div>{editor && <button className="primary" onClick={add}>
<Plus size={17}/>Tambah aset</button>}
</div>
<div className="cloud-status">
<span>Periksa pembaruan setiap 60 detik saat halaman aktif<br />
<small>Saham IDX Yahoo paling cepat setiap 5 menit · terakhir diperiksa: {dateText(checked)}
</small>
</span>
<button className="outline" disabled={refreshing} onClick={() => { setError(''); refresh(); }}>
<RefreshCw size={15}/>{refreshing ? 'Memperbarui…' : 'Perbarui harga'}
</button>
</div>{error && !draft && <div className="alert" role="alert">{error}
</div>}{notice && <p role="status" className="notice">{notice}
</p>}
<Tabs defaultValue="overview">
<div className="tabbar">
<TabsList variant="line">
<TabsTrigger value="overview">Ringkasan</TabsTrigger>
<TabsTrigger value="sources">Sumber harga</TabsTrigger>{member?.role === 'admin' && <TabsTrigger value="admin">Kelola akses</TabsTrigger>}
</TabsList>
</div>
<TabsContent value="overview">{loading ? <div className="loading">Memuat catatan…</div> : <>
<section className="metrics">
<article className="metric main-metric">
<span>{t.missing ? 'Nilai aset berharga · parsial' : 'Nilai portofolio'}
</span>
<h2>{rp(t.value)}
</h2>
<div className={t.gain >= 0 ? 'positive' : 'negative'}>{percent(t.gain, t.pricedCost)}
<small>{t.missing ? `${t.missing} aset belum memiliki harga` : 'dari modal aset berharga'}
</small>
</div>
</article>
<article className="metric">
<span>Total modal aktif</span>
<h2>{rp(t.cost)}
</h2>
<small>{assets.length} aset tersimpan</small>
</article>
<article className="metric">
<span>Unrealized P/L{t.missing ? ' · parsial' : ''}
</span>
<h2 className={t.gain >= 0 ? 'positive' : 'negative'}>{rp(t.gain)}
</h2>
<small>Hanya aset dengan harga tersedia</small>
</article>
<article className="metric">
<span>Kualitas data</span>
<h2>{assets.filter(a => ['Otomatis', 'Snapshot penyedia', 'Pasar tutup', 'Akhir hari', 'NAB harian', 'Tertunda'].includes(label(quoteFor(a, quotes)))).length} / {assets.length}
</h2>
<small>Feed tersedia · sisanya manual/lama/gagal</small>
</article>
</section>{assets.length === 0 ? <section className="panel empty">
<h3>Mulai portofolio Arbor.</h3>
<p>{editor ? 'Tambah aset atau impor file PRIVATE / backup Anda.' : 'Belum ada aset. Admin atau editor dapat menambahkan portofolio.'}
</p>
</section> : <section className="visual-grid">
<article className="panel allocation">
<div className="panel-title">
<h3>Alokasi portofolio</h3>
<span>{t.missing ? 'PARSIAL' : 'BERDASARKAN NILAI'}
</span>
</div>
<div className="allocation-body">
<div className="donut" style={{ background: t.value ? `conic-gradient(${gradient})` : '#29483d' }}>
<div>
<TreeDeciduous size={24}/>
<strong>{assets.length}
</strong>
<small>Aset aktif</small>
</div>
</div>
<div className="legend">{assets.map((a, i) => <div key={a.id}>
<i style={{ background: colors[i % 6] }}/>
<span>{a.symbol}
</span>
<strong>{quoteFor(a, quotes)?.price_idr == null ? '—' : t.value ? ((a.qty * Number(quoteFor(a, quotes)?.price_idr) / t.value) * 100).toFixed(1) + '%' : '0%'}
</strong>
</div>)}
</div>
</div>
</article>
<article className="panel contributions">
<div className="panel-title">
<h3>Kontribusi P/L</h3>
<span>NILAI AKTUAL</span>
</div>
<div className="bars">{assets.filter(a => quoteFor(a, quotes)?.price_idr != null).map(a => { const g = a.qty * Number(quoteFor(a, quotes)?.price_idr) - a.cost; const max = Math.max(1, ...assets.map(a => Math.abs(a.qty * Number(quoteFor(a, quotes)?.price_idr || 0) - a.cost))); return <div className="bar-row" key={a.id}>
<span>{a.symbol}
</span>
<div className="bar-track">
<div style={{ width: Math.max(1, Math.abs(g) / max * 100) + '%', background: g >= 0 ? '#91bca0' : '#d99583' }}/>
</div>
<strong className={g >= 0 ? 'positive' : 'negative'}>{rp(g)}
</strong>
</div>; })}
</div>
</article>
<article className="principle">
<span className="eyebrow">THE ARBOR PHILOSOPHY</span>
<h3>Strong roots.<br />Long horizons.</h3>
<img src="./assets/arbor-logo.png" alt=""/>
<span>DISCIPLINE COMPOUNDS FREEDOM</span>
</article>
</section>}
<section className="holdings">
<div className="section-title">
<div>
<h3>Aset dalam portofolio <span>{assets.length}
</span>
</h3>
<p>Total berubah mengikuti harga, jumlah unit, dan modal.</p>
</div>
<div className="actions">
<button className="outline" onClick={backup}>
<Download size={15}/>Backup</button>{editor && <label className="outline import-label">Impor<input type="file" accept=".json" onChange={e => { readImport(e.target.files?.[0]); e.target.value = ''; }}/>
</label>}
</div>
</div>
<Table>
<TableHeader>
<TableRow>{['Aset', 'Jumlah unit', 'Modal', 'Avg entry', 'Harga pasar', 'Nilai sekarang', 'P/L', 'Status harga', ''].map((v, i) => <TableHead key={i}>{v}
</TableHead>)}
</TableRow>
</TableHeader>
<TableBody>{assets.map((a, i) => { const q = quoteFor(a, quotes), known = q?.price_idr != null, g = known ? a.qty * Number(q.price_idr) - a.cost : 0; return <TableRow key={a.id}>
<TableCell>
<div className="asset">
<b style={{ color: colors[i % 6], background: colors[i % 6] + '17' }}>{a.symbol === 'BTC' ? '₿' : a.symbol[0]}
</b>
<div>
<strong>{a.symbol}
</strong>
<small>{a.broker || a.category}
</small>
</div>
</div>
</TableCell>
<TableCell>{Number(a.qty).toLocaleString('id-ID', { maximumFractionDigits: 9 })}
</TableCell>
<TableCell>{rp(a.cost)}
</TableCell>
<TableCell>{rp(averageEntry(a.qty, a.cost))}
</TableCell>
<TableCell>{known ? rp(Number(q.price_idr)) : '—'}
</TableCell>
<TableCell className="value">{known ? rp(a.qty * Number(q.price_idr)) : '—'}
</TableCell>
<TableCell className={g >= 0 ? 'positive' : 'negative'}>{known ? rp(g) : '—'}
<small className="cell-meta">{known ? percent(g, a.cost) : 'Belum dihitung'}
</small>
</TableCell>
<TableCell>
<span className={q?.error ? 'negative' : 'quote-tag'}>{label(q)}
</span>
<small className="cell-meta">{dateText(q?.as_of)}
</small>
</TableCell>
<TableCell>{editor && <button className="edit" aria-label={'Edit ' + a.symbol} onClick={() => edit(a)}>
<Pencil size={15}/>
</button>}
</TableCell>
</TableRow>; })}
</TableBody>
</Table>
<p className="table-note">Harga pasar dapat tertunda. Unit dan average dihitung dari transaksi yang Anda masukkan; aplikasi tidak mengakses rekening Stockbit/Bibit/Binance atau melakukan transaksi.</p>
</section>
</>}
</TabsContent>
<TabsContent value="sources">
<section className="sources">
<h2>Angka yang dapat ditelusuri.</h2>
<p>CoinGecko untuk kripto; Yahoo Finance untuk saham Indonesia dengan data tertunda; Twelve Data untuk saham/ETF global dan kurs. NAB reksa dana tersedia per hari kerja, bukan setiap detik. Feed khusus bisa dihubungkan oleh pemilik backend.</p>{assets.map(a => { const q = quoteFor(a, quotes); return <article key={a.id}>
<div>
<h3>{a.symbol} — {a.name}
</h3>
<p>{a.note}
</p>
<small>{a.provider} · {a.provider_id || 'manual'} · {a.exchange} · {a.currency}
<br />Harga: {dateText(q?.as_of)}
<br />Dicek: {dateText(q?.fetched_at)}
<br />Sumber: {q?.source || 'Belum tersedia'} · {label(q)}{q?.fx_as_of && <>
<br />Kurs: {q.fx_rate} · {dateText(q.fx_as_of)}
</>}
</small>{q?.error && <p className="negative">{q.error}
</p>}
</div>{editor && <button className="outline" onClick={() => edit(a)}>Edit data</button>}
</article>; })}
<p>Aset baru harus dipetakan ke ID dan bursa yang benar. Harga yang belum tersedia tidak dianggap nol dalam P/L; ringkasan ditandai parsial. Tidak ada sinkronisasi riwayat transaksi broker.</p>
<p>Data kripto: <a href="https://www.coingecko.com/en/api" target="_blank" rel="noreferrer">Powered by CoinGecko API</a> Data saham IDX: <a href="https://finance.yahoo.com" target="_blank" rel="noreferrer">Yahoo Finance</a> · Data global: <a href="https://twelvedata.com" target="_blank" rel="noreferrer">Twelve Data</a>
</p>
</section>
</TabsContent>{member?.role === 'admin' && <TabsContent value="admin">
<section className="sources">
<h2>Otoritas akses.</h2>
<p>Pendaftaran baru selalu menunggu persetujuan. Viewer hanya membaca; editor mengubah aset; admin juga mengelola akun. Email harus terverifikasi sebelum disetujui.</p>{members.map(m => <article key={m.user_id}>
<div>
<strong>{m.email}
</strong>
<small className="cell-meta">{m.role}{m.user_id === session.user.id ? ' · akun Anda' : ''}
</small>
</div>
<select aria-label={'Role ' + m.email} disabled={m.user_id === session.user.id} value={m.role} onChange={e => role(m.user_id, e.target.value)}>
<option value="pending" disabled>Menunggu</option>
<option value="viewer">Viewer</option>
<option value="editor">Editor</option>
<option value="admin">Admin</option>
<option value="blocked">Blokir</option>
</select>
</article>)}
<h3>Aktivitas terakhir</h3>{audit.map(l => <p key={l.id}>{dateText(l.at)} · {l.action} · {members.find(m => m.user_id === l.actor)?.email || l.actor || 'Sistem'} · {l.detail?.symbol || l.detail?.role || ''}
</p>)}
</section>
</TabsContent>}
</Tabs>
</>}
<footer>
<span>ARBOR CAPITAL <small>Private family office</small>
</span>
<span>Discipline today. A freer tomorrow.</span>
</footer>
</main>
<Dialog open={!!draft} onOpenChange={open => {
            if (!saving && !open)
                setDraft(null);
        }}>
<DialogContent className="editor">
<DialogTitle>{draft?.version ? 'Edit aset' : 'Tambah aset'}
</DialogTitle>
<DialogDescription>Pilih instrumen, masukkan nominal dan harga beli. Unit serta average entry dihitung otomatis.</DialogDescription>{draft && <form onSubmit={save}>
<label>Sumber harga<select value={draft.provider} onChange={e => { const provider = e.target.value as Asset['provider']; const next = { ...draft, provider, provider_id: '', exchange: '', currency: 'IDR', ...(!draft.version ? { qty: 0, cost: 0 } : {}) }; setDraft(next); setResults([]); setMarketPrice(null); setPurchase({ ...purchase, price: 0 }); }}>
<option value="coingecko">CoinGecko · kripto</option>
<option value="yahoo">Yahoo Finance · saham Indonesia</option>
<option value="twelve">Twelve Data · saham/ETF global</option>
<option value="custom">Feed khusus · IDX/NAB</option>
<option value="manual">Manual · termasuk NAV tanpa API</option>
</select>
</label>{['coingecko', 'twelve', 'yahoo'].includes(draft.provider) && <div className="search-area">
<label>Cari nama atau ticker<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Bitcoin, BBCA, PACK, ACWI…"/>
</label>
<button type="button" className="outline" disabled={searching || query.trim().length < 2} onClick={search}>
<Search size={14}/>{searching ? 'Mencari…' : 'Cari aset'}
</button>
<div className="search-results">{results.map((r, i) => <button type="button" key={i} onClick={() => chooseResult(r)}>
<strong>{r.symbol}
</strong> — {r.name}
<small>{r.provider_id} · {r.exchange || 'Kripto'} · {r.currency}
</small>
</button>)}
</div>
</div>}
<div className="fields">{[['symbol', 'Kode aset'], ['name', 'Nama'], ['broker', 'Broker / platform'], ['category', 'Kategori']].map(([key, text]) => <label key={key}>{text}
<input type="text" required={key !== 'broker'} value={String(draft[key as keyof Asset] ?? '')} onChange={e => setDraft({ ...draft, [key]: e.target.value })}/>
</label>)}
</div>{draft.provider !== 'manual' && <>
<label>{draft.provider === 'yahoo' ? 'Simbol Yahoo (otomatis)' : 'ID penyedia'}
<input required={draft.provider !== 'yahoo'} placeholder={draft.provider === 'yahoo' ? 'Otomatis dari kode aset' : undefined} value={draft.provider_id} onChange={e => setDraft({ ...draft, provider_id: e.target.value })}/>
</label>{draft.provider === 'twelve' && <div className="fields">
<label>Bursa<input required value={draft.exchange} onChange={e => setDraft({ ...draft, exchange: e.target.value })}/>
</label>
<label>Mata uang asli<input required pattern="[A-Z]{3}" value={draft.currency} onChange={e => setDraft({ ...draft, currency: e.target.value.toUpperCase() })}/>
</label>
</div>}
<p className="field-help">Jika simbol/paket API tidak didukung, status akan menunjukkan harga belum tersedia. Feed khusus memerlukan konfigurasi admin backend.</p>
</>}{draft.provider === 'manual' && <div className="fields">
<label>Harga per unit dalam Rp<input required type="number" step="any" min="0.000000000001" value={draft.manual_price ?? ''} onChange={e => setDraft({ ...draft, manual_price: Number(e.target.value) })}/>
</label>
<label>Tanggal harga<input required type="date" value={draft.manual_as_of?.slice(0, 10) || ''} onChange={e => setDraft({ ...draft, manual_as_of: e.target.value ? e.target.value + 'T00:00:00+07:00' : '' })}/>
</label>
</div>}
<PositionCalculator asset={draft} purchase={purchase} marketPrice={marketPrice} priceBusy={priceBusy} onPurchase={updatePurchase} onPreview={() => previewPrice(draft)} onApply={applyAverageDown} onManual={(qty, cost) => setDraft({ ...draft, qty, cost })}/>
<label>Catatan<textarea maxLength={3000} value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })}/>
</label>{draft.version && <section className="delete-zone">
<div>
<strong>Hapus aset</strong>
<small>Ketik <b>{draft.symbol.toUpperCase()}</b> untuk mengonfirmasi. Harga terkait ikut dihapus dan aktivitas dicatat.</small>
</div>
<input aria-label={'Konfirmasi hapus ' + draft.symbol} value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder={draft.symbol.toUpperCase()}/>
<button type="button" className="danger" disabled={saving || deleteConfirm.trim().toUpperCase() !== draft.symbol.trim().toUpperCase()} onClick={removeAsset}>
<Trash2 size={15}/>{saving ? 'Memproses…' : 'Hapus aset'}
</button>
</section>}{error && <p role="alert" className="negative">{error}
</p>}
<button disabled={saving} className="primary save">{saving ? 'Menyimpan…' : 'Simpan aset'}
</button>
</form>}
</DialogContent>
</Dialog>
<Dialog open={!!importRows} onOpenChange={open => {
            if (!saving && !open)
                setImportRows(null);
        }}>
<DialogContent className="editor">
<DialogTitle>Impor portofolio</DialogTitle>
<DialogDescription>Aset dengan ID yang sama diperbarui. Aset baru ditambahkan; data lain tidak dihapus. Impor dapat berhenti sebagian jika terdapat kesalahan.</DialogDescription>
<p>{importRows?.length} aset: {importRows?.map(a => a.symbol).join(', ')}
</p>
<button disabled={saving} className="primary" onClick={doImport}>{saving ? 'Mengimpor…' : 'Konfirmasi impor'}
</button>
</DialogContent>
</Dialog>
</div>;
}
