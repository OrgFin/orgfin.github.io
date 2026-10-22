'use strict';

/* ================= Estado e armazenamento ================= */

const CHAVE = 'meu-caixa.v1'; // nome antigo mantido para não perder os dados já salvos

const CATEGORIAS_SAIDA = ['Moradia', 'Contas da casa', 'Mercado', 'Restaurante e delivery', 'Transporte', 'Saúde', 'Educação',
  'Assinaturas', 'Cartão de crédito', 'Dívidas', 'Lazer', 'Compras', 'Família', 'Outros'];
const CATEGORIAS_ENTRADA = ['Salário', 'Benefício', 'Renda extra', 'Reembolso', 'Outros'];
const FORMAS = { dinheiro: 'Conta/dinheiro', cartao: 'Cartão de crédito', beneficio: 'Benefício (vale)' };
const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function estadoVazio() {
  return {
    versao: 1,
    config: {
      saldoInicial: 0,
      dataSaldo: hojeISO(),
      saldoDefinido: false,
      faixas: [-500, 0, 1000, 2000],
      sabadoUtil: false
    },
    recorrentes: [],
    lancamentos: [],
    dividas: [],
    economia: {},
    pagos: {},
    plano: {}
  };
}

let S = carregar();
const ui = { mes: mesISO(new Date()), view: 'painel', termoModo: 'mes' };

function carregar() {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (bruto) return normalizar(JSON.parse(bruto));
  } catch (e) { /* sem armazenamento: segue com estado vazio */ }
  return estadoVazio();
}

function normalizar(d) {
  const base = estadoVazio();
  return {
    ...base, ...d,
    config: { ...base.config, ...(d.config || {}) },
    recorrentes: d.recorrentes || [], lancamentos: d.lancamentos || [], dividas: d.dividas || [],
    economia: d.economia || {}, pagos: d.pagos || {}, plano: d.plano || {}
  };
}

function salvar() {
  cache.clear();
  try { localStorage.setItem(CHAVE, JSON.stringify(S)); }
  catch (e) { toast('Não foi possível salvar neste navegador. Exporte um backup.'); }
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/* ================= Datas ================= */

function pad(n) { return String(n).padStart(2, '0'); }
function hojeISO() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function mesISO(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
function isoDe(y, m, d) { return `${y}-${pad(m)}-${pad(d)}`; }
function ymNum(s) { const [y, m] = s.split('-').map(Number); return y * 12 + (m - 1); }
function ymDeNum(n) { return `${Math.floor(n / 12)}-${pad((n % 12) + 1)}`; }
function diasNoMes(y, m) { return new Date(y, m, 0).getDate(); }
function diaDaSemana(y, m, d) { return new Date(y, m - 1, d).getDay(); }
const NOMES_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function nomeMes(ym) { const [y, m] = ym.split('-').map(Number); return `${NOMES_MES[m - 1]} de ${y}`; }
function mesCurto(ym) { const [y, m] = ym.split('-').map(Number); return `${MES_CURTO[m - 1]}/${y}`; }
function dataBR(iso) { const [, m, d] = iso.split('-'); return `${d}/${m}`; }
function dataBRCompleta(iso) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }

// Feriados nacionais (inclui Sexta-feira Santa, que depende da Páscoa)
const feriadosCache = {};
function feriados(y) {
  if (feriadosCache[y]) return feriadosCache[y];
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  const pascoa = new Date(y, mes - 1, dia);
  const sexta = new Date(pascoa); sexta.setDate(pascoa.getDate() - 2);
  const lista = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25']
    .map((md) => `${y}-${md}`);
  lista.push(isoDe(sexta.getFullYear(), sexta.getMonth() + 1, sexta.getDate()));
  return (feriadosCache[y] = new Set(lista));
}

function enesimoDiaUtil(y, m, n) {
  const fer = feriados(y), total = diasNoMes(y, m);
  let cont = 0;
  for (let d = 1; d <= total; d++) {
    const ds = diaDaSemana(y, m, d);
    if (ds === 0 || (ds === 6 && !S.config.sabadoUtil) || fer.has(isoDe(y, m, d))) continue;
    if (++cont === n) return d;
  }
  return total;
}

/* ================= Dinheiro ================= */

const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brl = (v) => fmtBRL.format(v || 0);
function lerValor(txt) {
  if (typeof txt === 'number') return txt;
  let s = String(txt || '').replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}
const valorCampo = (v) => (v || v === 0) && Number.isFinite(Number(v)) ? Number(v).toFixed(2).replace('.', ',') : '';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ================= Motor de cálculo ================= */

const cache = new Map();
function memo(chave, fn) { if (!cache.has(chave)) cache.set(chave, fn()); return cache.get(chave); }

function limitesRecorrente(r) {
  const ini = ymNum(r.inicio || '2000-01');
  let fim = Infinity;
  if (r.parcelas) fim = ini + Number(r.parcelas) - 1;
  else if (r.fim) fim = ymNum(r.fim);
  return { ini, fim };
}

// Ocorrências de uma conta recorrente num mês
function ocorrenciasRecorrente(r, y, m) {
  if (r.ativo === false) return [];
  const ym = y * 12 + (m - 1), { ini, fim } = limitesRecorrente(r);
  if (ym < ini || ym > fim) return [];
  const extra = r.parcelas ? { parcela: ym - ini + 1, total: Number(r.parcelas) } : {};
  if (r.freq === 'semanal') {
    const out = [];
    for (let d = 1; d <= diasNoMes(y, m); d++) {
      if (diaDaSemana(y, m, d) === Number(r.diaSemana)) out.push({ data: isoDe(y, m, d), ...extra });
    }
    return out;
  }
  const dia = r.diaUtil ? enesimoDiaUtil(y, m, Number(r.dia) || 1) : Math.min(Number(r.dia) || 1, diasNoMes(y, m));
  return [{ data: isoDe(y, m, dia), ...extra }];
}

// Ocorrências de um lançamento avulso (pode ser parcelado)
function ocorrenciasLancamento(l, y, m) {
  const [ly, lm, ld] = l.data.split('-').map(Number);
  const n = Math.max(1, Number(l.parcelas) || 1), k = (y * 12 + m - 1) - (ly * 12 + lm - 1);
  if (k < 0 || k >= n) return [];
  return [{ data: isoDe(y, m, Math.min(ld, diasNoMes(y, m))), parcela: n > 1 ? k + 1 : undefined, total: n > 1 ? n : undefined }];
}

// Todos os itens do mês, fixos e avulsos
function itensDoMes(ym) {
  return memo('itens:' + ym, () => {
    const [y, m] = ym.split('-').map(Number), out = [];
    for (const r of S.recorrentes) {
      for (const o of ocorrenciasRecorrente(r, y, m)) {
        out.push({ ...o, origem: 'fixo', id: r.id, tipo: r.tipo, valor: Number(r.valor), descricao: r.descricao, categoria: r.categoria, forma: r.forma || 'dinheiro' });
      }
    }
    for (const l of S.lancamentos) {
      for (const o of ocorrenciasLancamento(l, y, m)) {
        out.push({ ...o, origem: 'avulso', id: l.id, tipo: l.tipo, valor: Number(l.valor), descricao: l.descricao, categoria: l.categoria, forma: l.forma || 'dinheiro' });
      }
    }
    return out.sort((a, b) => a.data.localeCompare(b.data) || (a.tipo === 'entrada' ? -1 : 1));
  });
}

// Saldo dia a dia. O saldo informado em Ajustes vale para o fim do dia escolhido.
function serieDoMes(ym) {
  return memo('serie:' + ym, () => {
    const alvo = ymNum(ym), inicioYM = ymNum(S.config.dataSaldo.slice(0, 7));
    if (alvo < inicioYM) return montarMes(ym, null);
    let saldo = null;
    for (let n = inicioYM; n < alvo; n++) saldo = montarMes(ymDeNum(n), saldo).fim;
    return montarMes(ym, saldo);
  });
}

function montarMes(ym, saldoAnterior) {
  const chave = 'mes:' + ym + ':' + saldoAnterior;
  return memo(chave, () => {
    const [y, m] = ym.split('-').map(Number), itens = itensDoMes(ym), total = diasNoMes(y, m);
    const ds = S.config.dataSaldo, dias = [];
    let saldo = saldoAnterior;
    for (let d = 1; d <= total; d++) {
      const data = isoDe(y, m, d), doDia = itens.filter((i) => i.data === data && i.forma === 'dinheiro');
      const ent = soma(doDia.filter((i) => i.tipo === 'entrada'));
      const fixo = soma(doDia.filter((i) => i.tipo === 'saida' && i.origem === 'fixo'));
      const avulso = soma(doDia.filter((i) => i.tipo === 'saida' && i.origem === 'avulso'));
      if (data === ds) saldo = Number(S.config.saldoInicial) || 0;
      else if (data > ds && saldo !== null) saldo = Math.round((saldo + ent - fixo - avulso) * 100) / 100;
      dias.push({ data, dia: d, ent, fixo, avulso, saldo: data < ds ? null : saldo, itens: itens.filter((i) => i.data === data) });
    }
    return { dias, fim: saldo };
  });
}

const soma = (lista) => Math.round(lista.reduce((t, i) => t + (Number(i.valor) || 0), 0) * 100) / 100;

function resumoDoMes(ym) {
  const itens = itensDoMes(ym), din = itens.filter((i) => i.forma === 'dinheiro');
  const entradas = soma(din.filter((i) => i.tipo === 'entrada'));
  const fixos = soma(din.filter((i) => i.tipo === 'saida' && i.origem === 'fixo'));
  const avulsos = soma(din.filter((i) => i.tipo === 'saida' && i.origem === 'avulso'));
  const salario = soma(din.filter((i) => i.tipo === 'entrada' && i.categoria === 'Salário'));
  const cartao = soma(itens.filter((i) => i.forma === 'cartao' && i.tipo === 'saida'));
  const benefEnt = soma(itens.filter((i) => i.forma === 'beneficio' && i.tipo === 'entrada'));
  const benefSai = soma(itens.filter((i) => i.forma === 'beneficio' && i.tipo === 'saida'));
  return { entradas, fixos, avulsos, salario, cartao, benefEnt, benefSai, sobra: Math.round((entradas - fixos - avulsos) * 100) / 100 };
}

function faixa(s) {
  if (s === null || s === undefined) return 0;
  const [a, b, c, d] = S.config.faixas;
  if (s < a) return 1; if (s < b) return 2; if (s < c) return 3; if (s < d) return 4; return 5;
}
const NOME_FAIXA = ['Sem dado', 'Crítico', 'Negativo', 'Apertado', 'Tranquilo', 'Folga'];

// Parcelamentos ativos a partir do mês escolhido
function parcelados(ym) {
  const atual = ymNum(ym), out = [];
  for (const r of S.recorrentes) {
    if (!r.parcelas || r.ativo === false || r.tipo !== 'saida') continue;
    const { ini, fim } = limitesRecorrente(r);
    if (fim < atual) continue;
    out.push(infoParcela(r.descricao, Number(r.valor), ini, Number(r.parcelas), atual, r.forma, 'fixo', r.id));
  }
  for (const l of S.lancamentos) {
    const n = Number(l.parcelas) || 1;
    if (n < 2 || l.tipo !== 'saida') continue;
    const ini = ymNum(l.data.slice(0, 7));
    if (ini + n - 1 < atual) continue;
    out.push(infoParcela(l.descricao, Number(l.valor), ini, n, atual, l.forma, 'avulso', l.id));
  }
  return out.sort((a, b) => a.fim - b.fim);
}
function infoParcela(descricao, valor, ini, total, atual, forma, origem, id) {
  const atualN = Math.max(1, atual - ini + 1), restantes = total - Math.max(0, atual - ini);
  return { descricao, valor, total, parcela: atual >= ini ? atualN : 0, comeca: ini, fim: ini + total - 1, restante: Math.round(valor * Math.min(total, restantes) * 100) / 100, forma, origem, id };
}

/* ================= Interface: utilidades ================= */

const $ = (sel, el = document) => el.querySelector(sel);
const main = $('#main');

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}


function corValor(v) { return v < 0 ? 'neg' : ''; }
function tagForma(f) { return f && f !== 'dinheiro' ? ` <span class="tag">${f === 'cartao' ? 'cartão' : 'vale'}</span>` : ''; }
function tagParcela(i) { return i.total ? ` <span class="tag">${i.parcela}/${i.total}</span>` : ''; }
function legendaFaixas() {
  const [a, b, c, d] = S.config.faixas;
  return `<div class="legend">
    <span><i class="sw b1"></i>Crítico: abaixo de ${brl(a)}</span>
    <span><i class="sw b2"></i>Negativo: até ${brl(b)}</span>
    <span><i class="sw b3"></i>Apertado: até ${brl(c)}</span>
    <span><i class="sw b4"></i>Tranquilo: até ${brl(d)}</span>
    <span><i class="sw b5"></i>Folga: acima de ${brl(d)}</span>
  </div>`;
}

/* ================= Telas ================= */

const VIEWS = {};

function render() {
  { const [y, m] = ui.mes.split('-').map(Number), n = NOMES_MES[m - 1]; $('#monthLabel').textContent = `${n[0].toUpperCase()}${n.slice(1)} ${y}`; }
  const noMais = ['contas', 'economia', 'ajustes', 'mais'].includes(ui.view);
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === ui.view || (b.dataset.view === 'mais' && noMais)));
  $('#monthPicker').style.visibility = ['ajustes', 'mais'].includes(ui.view) ? 'hidden' : 'visible';
  main.innerHTML = VIEWS[ui.view]();
  if (ui.view === 'painel') desenharGrafico();
}

/* ---------- Painel ---------- */
VIEWS.painel = () => {
  const r = resumoDoMes(ui.mes), serie = serieDoMes(ui.mes), itens = itensDoMes(ui.mes);
  const hoje = hojeISO(), ehMesAtual = ui.mes === hoje.slice(0, 7);
  const comSaldo = serie.dias.filter((d) => d.saldo !== null);
  const menor = comSaldo.reduce((a, d) => (a === null || d.saldo < a.saldo ? d : a), null);
  const negativos = comSaldo.filter((d) => d.saldo < 0);
  const diaHoje = serie.dias.find((d) => d.data === hoje);

  const gastos = itens.filter((i) => i.tipo === 'saida');
  const maior = gastos.reduce((a, i) => (!a || i.valor > a.valor ? i : a), null);
  const maiorAvulso = gastos.filter((i) => i.origem === 'avulso').reduce((a, i) => (!a || i.valor > a.valor ? i : a), null);
  const porCat = {};
  gastos.forEach((i) => { porCat[i.categoria || 'Outros'] = (porCat[i.categoria || 'Outros'] || 0) + i.valor; });
  const cats = Object.entries(porCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxCat = cats.length ? cats[0][1] : 1;

  const parc = parcelados(ui.mes);
  const parcNoMes = parc.filter((p) => p.parcela > 0);
  const totalParcMes = Math.round(parcNoMes.reduce((t, p) => t + p.valor, 0) * 100) / 100;

  const contas = itens.filter((i) => i.tipo === 'saida' && i.origem === 'fixo');

  let aviso = '';
  if (!S.recorrentes.length && !S.lancamentos.length) {
    aviso = `<div class="alert warn"><div>Comece cadastrando seu salário e suas contas fixas em <button class="link-btn" data-go="contas">Contas</button>, e informe quanto tem na conta hoje em <button class="link-btn" data-go="ajustes">Ajustes</button>. Se tiver um arquivo de dados, importe em Ajustes.</div></div>`;
  } else if (!S.config.saldoDefinido) {
    aviso = `<div class="alert warn"><div>O termômetro está contando a partir de saldo zero. Informe quanto você tem na conta hoje em <button class="link-btn" data-go="ajustes">Ajustes</button> para a projeção ficar certa.</div></div>`;
  } else if (negativos.length) {
    aviso = `<div class="alert bad"><div>O saldo fica negativo em ${negativos.length} ${negativos.length === 1 ? 'dia' : 'dias'} deste mês, a primeira vez em <b>${dataBR(negativos[0].data)}</b> (${brl(negativos[0].saldo)}). Veja no <button class="link-btn" data-go="termometro">Termômetro</button> o que cai nesse dia.</div></div>`;
  } else if (comSaldo.length) {
    aviso = `<div class="alert ok"><div>Saldo positivo o mês todo. O ponto mais baixo é ${brl(menor.saldo)} em ${dataBR(menor.data)}.</div></div>`;
  }

  return `<div class="stack">
    ${aviso}
    <div class="grid tiles">
      <div class="card tile"><div class="label">Salário</div><div class="value num">${brl(r.salario)}</div>
        <div class="sub">${r.entradas !== r.salario ? `Entradas totais ${brl(r.entradas)}` : 'Entradas do mês'}</div></div>
      <div class="card tile"><div class="label">Gastos fixos</div><div class="value num">${brl(r.fixos)}</div>
        <div class="sub">${r.entradas ? Math.round((r.fixos / r.entradas) * 100) + '% da renda' : '&nbsp;'}</div></div>
      <div class="card tile"><div class="label">Gastos avulsos</div><div class="value num">${brl(r.avulsos)}</div>
        <div class="sub">${r.cartao ? `Mais ${brl(r.cartao)} no cartão` : 'Pagos na conta'}</div></div>
      <div class="card tile"><div class="label">Sobra do mês</div><div class="value num ${r.sobra < 0 ? 'neg' : 'pos'}">${brl(r.sobra)}</div>
        <div class="sub">Entradas menos saídas</div></div>
    </div>

    <div class="grid two">
      <div class="card">
        <div class="card-head"><h2>Maior gasto do mês</h2></div>
        ${maior ? `<div class="tile"><div class="value num">${brl(maior.valor)}</div>
          <div class="sub">${esc(maior.descricao)} · ${dataBR(maior.data)}${maior.origem === 'fixo' ? ' · conta fixa' : ''}</div></div>
          ${maiorAvulso && maiorAvulso !== maior ? `<p class="small muted" style="margin:10px 0 0">Maior gasto avulso: <b class="num">${brl(maiorAvulso.valor)}</b> em ${esc(maiorAvulso.descricao)} (${dataBR(maiorAvulso.data)})</p>` : ''}
          <h3 style="margin:18px 0 8px">Para onde vai o dinheiro</h3>
          <div class="bars">${cats.map(([c, v]) => `
            <div class="bar-row"><span class="bar-label">${esc(c)}</span>
              <span class="bar-track"><span class="bar-fill" style="width:${Math.max(2, (v / maxCat) * 100)}%"></span></span>
              <span class="num small">${brl(v)}</span></div>`).join('')}</div>`
          : '<p class="empty">Nenhum gasto neste mês.</p>'}
      </div>

      <div class="card">
        <div class="card-head"><h2>Parcelados</h2><span class="muted small num">${parcNoMes.length ? `${brl(totalParcMes)} neste mês` : ''}</span></div>
        ${parc.length ? `<ul class="list">${parc.map((p) => `
          <li class="clickable" data-edit="${p.origem}" data-id="${p.id}">
            <div class="grow"><div class="title">${esc(p.descricao)}${tagForma(p.forma)}</div>
              <div class="meta">${p.parcela ? `Parcela ${p.parcela} de ${p.total}` : `Começa em ${mesCurto(ymDeNum(p.comeca))}`} · termina em ${mesCurto(ymDeNum(p.fim))}</div></div>
            <div style="text-align:right"><div class="num">${brl(p.valor)}</div><div class="meta num">falta ${brl(p.restante)}</div></div>
          </li>`).join('')}</ul>
          <p class="small muted" style="margin:10px 0 0">Total que ainda falta pagar: <b class="num">${brl(parc.reduce((t, p) => t + p.restante, 0))}</b></p>`
          : '<p class="empty">Nenhum parcelamento. Para cadastrar, informe o número de parcelas ao criar uma conta ou um lançamento.</p>'}
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h2>Saldo dia a dia</h2>
        <span class="small muted">${ehMesAtual && diaHoje && diaHoje.saldo !== null ? `Hoje: <b class="num">${brl(diaHoje.saldo)}</b> · ` : ''}Fim do mês: <b class="num ${corValor(serie.fim)}">${serie.fim === null ? 'sem dado' : brl(serie.fim)}</b></span></div>
      <div class="chart" id="chart"></div>
      <div class="mini-strip">${serie.dias.map((d) => `<i class="cell b${faixa(d.saldo)}${d.data === hoje ? ' today' : ''}" data-dia="${d.data}" title="${dataBR(d.data)}: ${d.saldo === null ? 'sem dado' : brl(d.saldo)}"></i>`).join('')}</div>
      <div style="margin-top:10px">${legendaFaixas()}</div>
    </div>

    <div class="grid two">
      <div class="card">
        <div class="card-head"><h2>Contas do mês</h2><span class="small muted">${contas.filter((c) => S.pagos[c.id + '@' + c.data]).length} de ${contas.length} pagas</span></div>
        ${contas.length ? `<ul class="list">${contas.map((c) => {
          const pago = !!S.pagos[c.id + '@' + c.data];
          return `<li class="${pago ? 'done' : ''}">
            <input type="checkbox" class="check" data-pago="${c.id}@${c.data}" ${pago ? 'checked' : ''} aria-label="Marcar ${esc(c.descricao)} como paga">
            <div class="date-chip"><b>${c.data.slice(8)}</b>${DIAS_SEMANA[new Date(c.data + 'T12:00').getDay()].slice(0, 3)}</div>
            <div class="grow"><div class="title">${esc(c.descricao)}${tagForma(c.forma)}${tagParcela(c)}</div><div class="meta">${esc(c.categoria || '')}</div></div>
            <div class="num">${brl(c.valor)}</div></li>`;
        }).join('')}</ul>` : '<p class="empty">Nenhuma conta fixa cadastrada.</p>'}
      </div>
      <div class="card">
        <div class="card-head"><h2>Benefícios e cartão</h2></div>
        <ul class="list">
          <li><div class="grow"><div class="title">Vales recebidos</div><div class="meta">Não entram no saldo da conta</div></div><div class="num">${brl(r.benefEnt)}</div></li>
          <li><div class="grow"><div class="title">Gasto com vales</div><div class="meta">Sobra ${brl(r.benefEnt - r.benefSai)}</div></div><div class="num">${brl(r.benefSai)}</div></li>
          <li><div class="grow"><div class="title">Compras no cartão</div><div class="meta">Vão para a próxima fatura</div></div><div class="num">${brl(r.cartao)}</div></li>
          <li><div class="grow"><div class="title">Dívidas em aberto</div><div class="meta">${S.dividas.filter((d) => d.status !== 'quitada').length} registradas</div></div>
            <div class="num">${brl(soma(S.dividas.filter((d) => d.status !== 'quitada')))}</div></li>
        </ul>
      </div>
    </div>
  </div>`;
};

function desenharGrafico() {
  const el = $('#chart'); if (!el) return;
  const dias = serieDoMes(ui.mes).dias, pts = dias.filter((d) => d.saldo !== null);
  if (pts.length < 2) { el.innerHTML = '<p class="empty">Sem saldo para mostrar neste mês. Confira a data do saldo inicial em Ajustes.</p>'; return; }
  const W = Math.max(280, el.clientWidth), H = window.innerWidth <= 720 ? 180 : 220;
  const pl = 64, pr = 10, pt = 10, pb = 24;
  const vals = pts.map((d) => d.saldo);
  let min = Math.min(0, ...vals), max = Math.max(0, ...vals);
  if (max === min) max = min + 100;
  const passo = escalaPasso((max - min) / 4);
  min = Math.floor(min / passo) * passo; max = Math.ceil(max / passo) * passo;
  const x = (dia) => pl + ((dia - 1) / (dias.length - 1)) * (W - pl - pr);
  const y = (v) => pt + (1 - (v - min) / (max - min)) * (H - pt - pb);
  let grade = '';
  for (let v = min; v <= max + 0.01; v += passo) {
    grade += `<line class="grid-line" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${pl - 8}" y="${y(v) + 4}" text-anchor="end">${abrev(v)}</text>`;
  }
  const marcas = [1, 5, 10, 15, 20, 25, dias.length].map((d) => `<text class="axis" x="${x(d)}" y="${H - 6}" text-anchor="middle">${d}</text>`).join('');
  const linha = pts.map((d, i) => `${i ? 'L' : 'M'}${x(d.dia).toFixed(1)},${y(d.saldo).toFixed(1)}`).join('');
  const area = `${linha}L${x(pts[pts.length - 1].dia)},${y(Math.max(min, 0))}L${x(pts[0].dia)},${y(Math.max(min, 0))}Z`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="height:${H}px" role="img" aria-label="Saldo projetado por dia em ${nomeMes(ui.mes)}">
    ${grade}<line class="zero" x1="${pl}" x2="${W - pr}" y1="${y(0)}" y2="${y(0)}"/>
    <path class="area" d="${area}"/><path class="line" d="${linha}"/>${marcas}
    <line class="cross" id="cross" y1="${pt}" y2="${H - pb}" visibility="hidden"/>
    <circle class="dot" id="dot" r="5" visibility="hidden"/>
    <rect x="${pl}" y="0" width="${W - pl - pr}" height="${H}" fill="transparent" id="hit"/>
  </svg>`;
  const svg = $('svg', el), hit = $('#hit', el), cross = $('#cross', el), dot = $('#dot', el), tip = $('#tooltip');
  const mover = (ev) => {
    const box = svg.getBoundingClientRect(), px = ((ev.clientX - box.left) / box.width) * W;
    const dia = Math.round(((px - pl) / (W - pl - pr)) * (dias.length - 1)) + 1;
    const d = dias[Math.min(dias.length, Math.max(1, dia)) - 1];
    if (!d || d.saldo === null) { esconder(); return; }
    cross.setAttribute('x1', x(d.dia)); cross.setAttribute('x2', x(d.dia)); cross.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', x(d.dia)); dot.setAttribute('cy', y(d.saldo)); dot.setAttribute('visibility', 'visible');
    const mov = d.itens.filter((i) => i.forma === 'dinheiro').map((i) => `${i.tipo === 'entrada' ? '+' : '−'} ${brl(i.valor)} ${esc(i.descricao)}`).join('<br>');
    tip.innerHTML = `<b>${dataBR(d.data)}</b> · ${NOME_FAIXA[faixa(d.saldo)]}<br>Saldo: <b>${brl(d.saldo)}</b>${mov ? '<br>' + mov : ''}`;
    tip.hidden = false;
    const tx = Math.min(window.innerWidth - tip.offsetWidth - 8, ev.clientX + 14);
    tip.style.left = Math.max(8, tx) + 'px'; tip.style.top = Math.max(8, ev.clientY - tip.offsetHeight - 12) + 'px';
  };
  const esconder = () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); };
  hit.addEventListener('pointermove', mover);
  hit.addEventListener('pointerdown', mover);
  hit.addEventListener('pointerleave', esconder);
}
function escalaPasso(bruto) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, bruto)))), n = bruto / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
function abrev(v) {
  const a = Math.abs(v), s = v < 0 ? '−' : '';
  return a >= 1000 ? `${s}${(a / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : `${s}${Math.round(a)}`;
}

/* ---------- Termômetro ---------- */
VIEWS.termometro = () => {
  const seg = `<div class="seg"><button data-termo="mes" class="${ui.termoModo === 'mes' ? 'on' : ''}">Mês</button><button data-termo="ano" class="${ui.termoModo === 'ano' ? 'on' : ''}">Ano</button></div>`;
  return ui.termoModo === 'ano' ? termometroAno(seg) : termometroMes(seg);
};

function termometroMes(seg) {
  const serie = serieDoMes(ui.mes), hoje = hojeISO(), r = resumoDoMes(ui.mes);
  const linhas = serie.dias.map((d) => {
    const ds = new Date(d.data + 'T12:00').getDay(), desc = d.itens.filter((i) => i.forma === 'dinheiro').map((i) => esc(i.descricao)).join(', ');
    return `<tr class="clickable ${d.data === hoje ? 'today' : ''} ${ds === 0 || ds === 6 ? 'weekend' : ''}" data-dia="${d.data}">
      <td class="num">${pad(d.dia)} <span class="muted small">${DIAS_SEMANA[ds].slice(0, 3)}</span></td>
      <td class="r num pos">${d.ent ? brl(d.ent) : ''}</td>
      <td class="r num">${d.fixo ? brl(d.fixo) : ''}</td>
      <td class="r num">${d.avulso ? brl(d.avulso) : ''}</td>
      <td class="r"><span class="band b${faixa(d.saldo)} num">${d.saldo === null ? 'sem dado' : brl(d.saldo)}</span></td>
      <td class="small muted hide-sm">${desc}</td></tr>`;
  }).join('');
  return `<div class="card">
    <div class="card-head"><h2>Termômetro de ${nomeMes(ui.mes)}</h2>${seg}</div>
    <p class="small muted" style="margin:-4px 0 12px">Saldo projetado da conta ao fim de cada dia. Toque num dia para ver ou lançar um gasto.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Dia</th><th class="r">Entradas</th><th class="r">Fixos</th><th class="r">Avulsos</th><th class="r">Saldo</th><th class="hide-sm">Movimentos</th></tr></thead>
      <tbody>${linhas}</tbody>
      <tfoot>
        <tr><td>Total</td><td class="r num pos">${brl(r.entradas)}</td><td class="r num">${brl(r.fixos)}</td><td class="r num">${brl(r.avulsos)}</td><td class="r num">${serie.fim === null ? '' : brl(serie.fim)}</td><td class="hide-sm"></td></tr>
        <tr><td colspan="4">Saída total (fixos mais avulsos)</td><td class="r num">${brl(r.fixos + r.avulsos)}</td><td class="hide-sm"></td></tr>
        <tr><td colspan="4">Resultado do mês (entradas menos saída total)</td><td class="r num ${r.sobra < 0 ? 'neg' : 'pos'}">${brl(r.sobra)}</td><td class="hide-sm"></td></tr>
      </tfoot>
    </table></div>
    <div style="margin-top:14px">${legendaFaixas()}</div>
  </div>`;
}

function termometroAno(seg) {
  const ano = Number(ui.mes.slice(0, 4)), hoje = hojeISO();
  let html = '<div class="year-grid"><span></span>';
  for (let d = 1; d <= 31; d++) html += `<span class="dh">${d % 5 === 0 || d === 1 ? d : ''}</span>`;
  for (let m = 1; m <= 12; m++) {
    const ym = `${ano}-${pad(m)}`, dias = serieDoMes(ym).dias;
    html += `<span class="ml" data-abrir-mes="${ym}">${MES_CURTO[m - 1]}</span>`;
    for (let d = 1; d <= 31; d++) {
      const dd = dias[d - 1];
      html += dd ? `<i class="cell b${faixa(dd.saldo)}${dd.data === hoje ? ' today' : ''}" data-dia="${dd.data}" title="${dataBR(dd.data)}: ${dd.saldo === null ? 'sem dado' : brl(dd.saldo)} (${NOME_FAIXA[faixa(dd.saldo)]})"></i>` : '<i class="cell none"></i>';
    }
  }
  html += '</div>';
  const meses = Array.from({ length: 12 }, (_, i) => `${ano}-${pad(i + 1)}`);
  return `<div class="card">
    <div class="card-head"><h2>Termômetro de ${ano}</h2>${seg}</div>
    <p class="small muted" style="margin:-4px 0 14px">Cada quadrado é um dia. A cor mostra em que faixa o saldo fica. Toque num mês para abrir.</p>
    ${html}
    <div style="margin-top:14px">${legendaFaixas()}</div>
  </div>
  <div class="card section"><div class="table-wrap"><table>
    <thead><tr><th>Mês</th><th class="r">Entradas</th><th class="r">Saídas</th><th class="r">Resultado</th><th class="r">Saldo no fim</th></tr></thead>
    <tbody>${meses.map((ym) => { const r = resumoDoMes(ym), f = serieDoMes(ym).fim; return `<tr class="clickable" data-abrir-mes="${ym}">
      <td style="text-transform:capitalize">${NOMES_MES[Number(ym.slice(5)) - 1]}</td><td class="r num">${brl(r.entradas)}</td><td class="r num">${brl(r.fixos + r.avulsos)}</td>
      <td class="r num ${r.sobra < 0 ? 'neg' : 'pos'}">${brl(r.sobra)}</td><td class="r"><span class="band b${faixa(f)} num">${f === null ? 'sem dado' : brl(f)}</span></td></tr>`; }).join('')}</tbody>
  </table></div></div>`;
}

/* ---------- Lançar (manual e PDF) ---------- */
VIEWS.lancar = () => {
  const itens = itensDoMes(ui.mes).filter((i) => i.origem === 'avulso');
  const tot = (f, t = 'saida') => soma(itens.filter((i) => i.forma === f && i.tipo === t));
  const porData = {};
  itens.forEach((i) => (porData[i.data] = porData[i.data] || []).push(i));
  const datas = Object.keys(porData).sort().reverse();
  return `<div class="stack">
    <div class="grid two">
      <form class="card" id="formLancar">
        <div class="card-head"><h2>Lançar um gasto</h2></div>
        <div style="display:grid;gap:12px">${camposLancamento(lancamentoPadrao(), false)}</div>
        <div style="margin-top:14px"><button class="btn primary" type="submit">Salvar lançamento</button></div>
      </form>
      <div class="card">
        <div class="card-head"><h2>Ler um PDF</h2></div>
        <p class="small muted" style="margin:-4px 0 12px">Anexe a fatura do cartão ou o extrato do banco em PDF. O app lê o arquivo aqui mesmo no aparelho, sem enviar para lugar nenhum, e mostra os gastos encontrados para você conferir antes de salvar.</p>
        ${radio('pdfTipo', { fatura: 'Fatura do cartão', extrato: 'Extrato da conta' }, ui.pdfTipo || 'fatura')}
        <label class="drop" id="drop" style="margin-top:12px">
          <input type="file" accept="application/pdf,.pdf" id="pdfArquivo">
          <b>Escolher PDF</b><br><span class="small">ou arraste o arquivo para cá</span>
        </label>
        <p class="hint" style="margin-top:10px">Funciona com PDF que tem texto (o que o banco gera para baixar). Foto ou PDF escaneado como imagem não dá para ler.</p>
        <div id="pdfStatus" class="small" style="margin-top:8px"></div>
      </div>
    </div>
    <div id="pdfRevisao">${ui.pdf ? revisaoPdf() : ''}</div>
    <div class="grid tiles">
      <div class="card tile"><div class="label">Gasto na conta</div><div class="value num">${brl(tot('dinheiro'))}</div><div class="sub">Pix, débito, dinheiro</div></div>
      <div class="card tile"><div class="label">No cartão</div><div class="value num">${brl(tot('cartao'))}</div><div class="sub">Entra na fatura</div></div>
      <div class="card tile"><div class="label">Com vales</div><div class="value num">${brl(tot('beneficio'))}</div><div class="sub">Alimentação e combustível</div></div>
      <div class="card tile"><div class="label">Entradas extras</div><div class="value num pos">${brl(tot('dinheiro', 'entrada'))}</div><div class="sub">Fora do salário fixo</div></div>
    </div>
    <div class="card">
      <div class="card-head"><h2>Lançamentos de ${nomeMes(ui.mes)}</h2></div>
      ${datas.length ? datas.map((dt) => `<h3 class="small muted" style="margin:14px 0 2px">${dataBRCompleta(dt)}</h3><ul class="list">${porData[dt].map((i) => `
        <li class="clickable" data-edit="avulso" data-id="${i.id}">
          <div class="grow"><div class="title">${esc(i.descricao)}${tagForma(i.forma)}${tagParcela(i)}</div><div class="meta">${esc(i.categoria || '')}</div></div>
          <div class="num ${i.tipo === 'entrada' ? 'pos' : ''}">${i.tipo === 'entrada' ? '+' : '−'} ${brl(i.valor)}</div></li>`).join('')}</ul>`).join('')
        : '<p class="empty">Nenhum lançamento neste mês.</p>'}
    </div>
  </div>`;
};

/* ---------- Leitura de PDF ---------- */
let pdfjs = null;
async function carregarPdfjs() {
  if (!pdfjs) {
    pdfjs = await import('./vendor/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf.worker.min.mjs', location.href).href;
  }
  return pdfjs;
}

// Junta os pedaços de texto do PDF em linhas, pela posição na página
async function linhasDoPdf(arquivo) {
  const lib = await carregarPdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) }).promise;
  const linhas = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const pagina = await doc.getPage(p), conteudo = await pagina.getTextContent();
    const pedacos = conteudo.items.filter((i) => i.str && i.str.trim()).map((i) => ({ t: i.str, x: i.transform[4], y: i.transform[5], w: i.width }));
    // Faturas costumam ter duas colunas: separa cada metade da página antes de montar as linhas
    const largura = pagina.getViewport({ scale: 1 }).width;
    for (const coluna of [pedacos.filter((q) => q.x < largura / 2), pedacos.filter((q) => q.x >= largura / 2)]) {
      linhas.push(...agruparLinhas(coluna));
    }
    linhas.push(...agruparLinhas(pedacos)); // também tenta a linha inteira
  }
  return linhas;
}

function agruparLinhas(pedacos) {
  const grupos = [];
  pedacos.slice().sort((a, b) => b.y - a.y || a.x - b.x).forEach((q) => {
    const g = grupos.find((g) => Math.abs(g.y - q.y) < 3);
    if (g) g.itens.push(q); else grupos.push({ y: q.y, itens: [q] });
  });
  return grupos.map((g) => {
    g.itens.sort((a, b) => a.x - b.x);
    let txt = '', fimAnterior = null;
    for (const q of g.itens) {
      if (fimAnterior !== null && q.x - fimAnterior > 1.5 && !txt.endsWith(' ')) txt += ' ';
      txt += q.t; fimAnterior = q.x + q.w;
    }
    return txt.replace(/\s+/g, ' ').trim();
  });
}

const MESES_TXT = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
const IGNORAR = /(total|saldo|limite|vencimento|fatura anterior|pagamento m[ií]nimo|melhor data|valor a pagar|lan[çc]amentos|resumo|encargos para o pr[oó]ximo|cet|taxa de juros|parcelamento da fatura|saque|cr[eé]dito rotativo m[aá]x)/i;
const PAGAMENTO = /(pagamento|pgto|pag fatura|estorno|cr[eé]dito de)/i;

const PALAVRAS_CATEGORIA = [
  ['Compras', /mercado ?livre|mercadolivre|amazon(?! prime)|shopee|magalu|magazine|americanas|aliexpress|shein|renner|riachuelo|c&a|casas bahia|kabum|centauro|netshoes/i],
  ['Restaurante e delivery', /ifood|rappi|restaur|lanchon|burger|mcdonald|mc donald|bk |pizza|habib|subway|outback|giraffas|spoleto|bob.?s|cafe|caf[eé]|bar e|choperia|a[cç]a[ií]/i],
  ['Mercado', /supermerc|mercado|atacad|assa[ií]|carrefour|guanabara|prezunic|hortifruti|hortifr|mundial|zona sul|padaria|p[aã]o de a[cç]ucar|extra |dia%|sacol[aã]o/i],
  ['Transporte', /uber|\b99\b|99app|99 tecnologia|posto|combust|shell|ipiranga|petrobras|br mania|estacion|ped[aá]gio|sem parar|conectcar|veloe|metr[oô]|riocard|bilhete|[oô]nibus/i],
  ['Saúde', /farm|drogar|droga|raia|pacheco|ven[aâ]ncio|cl[ií]nica|hospital|laborat|unimed|amil|odonto|dentista|psic|terapia/i],
  ['Assinaturas', /netflix|spotify|prime video|amazon prime|disney|hbo|\bmax\b|globoplay|youtube|apple\.com|google|claude|anthropic|openai|chatgpt|deezer|paramount|microsoft|adobe|icloud/i],
  ['Contas da casa', /\blight\b|enel|claro|vivo|\btim\b|\boi\b|net servi|naturgy|ceg|cedae|[aá]gua|energia|internet/i],
  ['Educação', /curso|udemy|hotmart|escola|faculdade|livrar|kiwify|eduzz|alura/i],
  ['Cartão de crédito', /juros|iof|encargo|anuidade|multa|rotativo|tarifa/i],
  ['Lazer', /cinema|ingresso|sympla|eventim|steam|playstation|xbox|nintendo|show|teatro|parque/i]
];
function adivinharCategoria(desc) {
  for (const [cat, re] of PALAVRAS_CATEGORIA) if (re.test(desc)) return cat;
  return 'Outros';
}

// Transforma as linhas de texto em lançamentos possíveis
function interpretarLinhas(linhas, tipo) {
  const hoje = new Date(), achados = [], vistos = new Set();
  const reValor = /(-\s*)?(?:R\$\s*)?(-\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})(\s*-|\s*[DC]\b)?\s*$/i;
  const reData = /^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\s+|^(\d{1,2})\s*(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?(?:\s*(?:de\s+)?(\d{4}))?\s+/i;
  for (const bruta of linhas) {
    const linha = bruta.trim(), md = linha.match(reData);
    if (!md) continue;
    const mv = linha.slice(md[0].length).match(reValor);
    if (!mv) continue;
    let dia, mes, ano;
    if (md[1]) { dia = +md[1]; mes = +md[2]; ano = md[3] ? +md[3] : null; }
    else { dia = +md[4]; mes = MESES_TXT[md[5].toLowerCase().slice(0, 3)]; ano = md[6] ? +md[6] : null; }
    if (!(mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31)) continue;
    if (ano && ano < 100) ano += 2000;
    if (!ano) { ano = hoje.getFullYear(); if (mes > hoje.getMonth() + 2) ano -= 1; }
    let desc = linha.slice(md[0].length, linha.length - mv[0].length).trim();
    if (!desc || IGNORAR.test(desc)) continue;
    const valor = lerValor(mv[3]), negativo = !!(mv[1] || mv[2] || (mv[4] && /-|c/i.test(mv[4])));
    if (!(valor > 0)) continue;
    let parcela = null, total = null;
    const mp = desc.match(/(?:parc(?:ela)?\.?\s*)?(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\s*$/i);
    if (mp && +mp[2] > 1 && +mp[1] <= +mp[2]) { parcela = +mp[1]; total = +mp[2]; desc = desc.slice(0, mp.index).trim(); }
    desc = desc.replace(/\s+/g, ' ').replace(/[-–*]+$/, '').trim();
    // linha que juntou duas colunas da página: descarta
    if (!desc || /\d,\d{2}\b/.test(desc) || /\b\d{1,2}\/\d{1,2}\b/.test(desc)) continue;
    // parcela 3 de 10 de uma compra feita em março cai em maio
    let data = isoDe(ano, mes, Math.min(dia, diasNoMes(ano, mes)));
    if (parcela > 1) {
      const n = ano * 12 + mes - 1 + (parcela - 1), y2 = Math.floor(n / 12), m2 = (n % 12) + 1;
      data = isoDe(y2, m2, Math.min(dia, diasNoMes(y2, m2)));
    }
    const chave = `${data}|${desc.toLowerCase()}|${valor}|${parcela}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    let tipoLanc = 'saida', marcado = true, aviso = '';
    if (tipo === 'fatura') {
      if (negativo || PAGAMENTO.test(desc)) { marcado = false; aviso = 'pagamento ou estorno'; tipoLanc = 'entrada'; }
    } else if (!negativo && !/(-|d)/i.test(mv[4] || '')) {
      tipoLanc = 'entrada';
    }
    const fixa = S.recorrentes.find((r) => { const p = (r.descricao || '').toLowerCase().split(/\s+/).find((w) => w.length >= 4); return p && desc.toLowerCase().includes(p); });
    if (tipo === 'extrato' && fixa) { marcado = false; aviso = `parece a conta fixa "${fixa.descricao}"`; }
    achados.push({ data, descricao: desc, valor, tipo: tipoLanc, categoria: tipoLanc === 'entrada' ? 'Outros' : adivinharCategoria(desc), parcela, total, marcado, aviso, projetar: true });
  }
  return achados.sort((a, b) => a.data.localeCompare(b.data));
}

async function lerPdf(arquivo) {
  const st = $('#pdfStatus');
  if (!arquivo || !/pdf$/i.test(arquivo.type || arquivo.name)) { toast('Escolha um arquivo PDF'); return; }
  st.textContent = 'Lendo o PDF...';
  try {
    const tipo = (document.querySelector('input[name=pdfTipo]:checked') || {}).value || 'fatura';
    ui.pdfTipo = tipo;
    const linhas = await linhasDoPdf(arquivo);
    if (!linhas.length) { st.textContent = 'Não encontrei texto nesse PDF. Ele pode ser uma imagem escaneada; nesse caso lance os gastos à mão.'; return; }
    const itens = interpretarLinhas(linhas, tipo);
    if (!itens.length) { st.textContent = 'Li o PDF, mas não reconheci nenhuma linha com data e valor. Se quiser, me mande o modelo do banco para eu ajustar a leitura.'; return; }
    ui.pdf = { itens, tipo, nome: arquivo.name };
    st.textContent = '';
    $('#pdfRevisao').innerHTML = revisaoPdf();
    $('#pdfRevisao').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    console.error(err);
    st.textContent = 'Não consegui abrir esse PDF. Se ele tiver senha, abra no computador, salve uma cópia sem senha e tente de novo.';
  }
}

function revisaoPdf() {
  const { itens, tipo, nome } = ui.pdf, marcados = itens.filter((i) => i.marcado);
  const totalMarcado = soma(marcados.filter((i) => i.tipo === 'saida'));
  const formaPadrao = tipo === 'fatura' ? 'cartao' : 'dinheiro';
  return `<div class="card">
    <div class="card-head"><h2>Conferir gastos do PDF</h2><span class="small muted">${esc(nome)}</span></div>
    <p class="small muted" style="margin:-4px 0 10px">Encontrei ${itens.length} ${itens.length === 1 ? 'linha' : 'linhas'}. Confira datas, valores e categorias, desmarque o que não quer lançar e salve. ${tipo === 'fatura' ? 'Os gastos entram como compra no cartão: não mexem no saldo da conta, que só muda quando você pagar a fatura.' : 'Desmarque o que já está cadastrado em Contas para não contar duas vezes.'}</p>
    <div class="row" style="margin-bottom:10px">
      <label class="field"><span>Salvar como pago com</span><select id="pdfForma">${Object.entries(FORMAS).map(([v, t]) => `<option value="${v}" ${v === formaPadrao ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    </div>
    <div class="table-wrap"><table class="pdf-table">
      <thead><tr><th></th><th>Data</th><th>Descrição</th><th>Categoria</th><th class="r">Valor</th></tr></thead>
      <tbody>${itens.map((i, n) => `<tr class="${i.marcado ? '' : 'off'}">
        <td class="c-chk"><input type="checkbox" class="check" data-pdf="${n}" data-campo="marcado" ${i.marcado ? 'checked' : ''} aria-label="Incluir"></td>
        <td class="c-data"><input type="date" data-pdf="${n}" data-campo="data" value="${i.data}"></td>
        <td class="c-desc"><input data-pdf="${n}" data-campo="descricao" value="${esc(i.descricao)}">
          ${i.total ? `<label class="hint" style="display:flex;gap:6px;align-items:center;margin-top:4px"><input type="checkbox" data-pdf="${n}" data-campo="projetar" ${i.projetar ? 'checked' : ''} style="width:auto"> Parcela ${i.parcela} de ${i.total}: lançar também as ${i.total - i.parcela} seguintes</label>` : ''}
          ${i.aviso ? `<div class="hint">${esc(i.aviso)}</div>` : ''}
          ${i.tipo === 'entrada' ? '<div class="hint">entra como crédito</div>' : ''}</td>
        <td class="c-cat"><select data-pdf="${n}" data-campo="categoria">${(i.tipo === 'entrada' ? CATEGORIAS_ENTRADA : CATEGORIAS_SAIDA).map((c) => `<option ${c === i.categoria ? 'selected' : ''}>${c}</option>`).join('')}</select></td>
        <td class="c-val"><input inputmode="decimal" data-pdf="${n}" data-campo="valor" value="${valorCampo(i.valor)}" style="text-align:right"></td>
      </tr>`).join('')}</tbody>
    </table></div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:14px">
      <button class="btn primary" data-action="pdf-salvar">Salvar ${marcados.length} ${marcados.length === 1 ? 'lançamento' : 'lançamentos'}</button>
      <button class="btn" data-action="pdf-cancelar">Descartar</button>
      <span class="spacer" style="flex:1"></span>
      <span class="small muted">Gastos marcados: <b class="num">${brl(totalMarcado)}</b></span>
    </div>
  </div>`;
}

function salvarPdf() {
  const forma = $('#pdfForma').value, novos = ui.pdf.itens.filter((i) => i.marcado);
  for (const i of novos) {
    const valor = lerValor(i.valor);
    if (!(valor > 0) || !i.data) continue;
    const parcelas = i.total && i.projetar ? i.total - i.parcela + 1 : 1;
    const descricao = i.total && !i.projetar ? `${i.descricao} (${i.parcela}/${i.total})` : i.descricao;
    S.lancamentos.push({ id: uid(), tipo: i.tipo, valor, descricao, data: i.data, categoria: i.categoria, forma, parcelas });
  }
  ui.pdf = null; salvar(); render();
  toast(`${novos.length} ${novos.length === 1 ? 'lançamento salvo' : 'lançamentos salvos'}`);
}

/* ---------- Plano de melhora ---------- */
function addMeses(ym, n) { return ymDeNum(ymNum(ym) + n); }
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

function diagnostico(ym) {
  const r = resumoDoMes(ym), serie = serieDoMes(ym), itens = itensDoMes(ym);
  const comSaldo = serie.dias.filter((d) => d.saldo !== null), negativos = comSaldo.filter((d) => d.saldo < 0);
  const dividas = S.dividas.filter((d) => d.status !== 'quitada'), totalDividas = soma(dividas);
  const parc = parcelados(ym), parcMes = Math.round(parc.filter((p) => p.parcela > 0).reduce((t, p) => t + p.valor, 0) * 100) / 100;
  const fixosDin = itens.filter((i) => i.tipo === 'saida' && i.origem === 'fixo' && i.forma === 'dinheiro');
  const porConta = {};
  fixosDin.forEach((i) => { porConta[i.id] = porConta[i.id] || { descricao: i.descricao, valor: 0 }; porConta[i.id].valor += i.valor; });
  const maiorFixo = Object.values(porConta).sort((a, b) => b.valor - a.valor)[0] || null;
  // média de gastos avulsos dos últimos 3 meses com dados
  const ult = [0, 1, 2].map((k) => resumoDoMes(addMeses(ym, -k)).avulsos).filter((v) => v > 0);
  const mediaAvulsos = ult.length ? ult.reduce((a, b) => a + b, 0) / ult.length : r.avulsos;
  const custoMes = Math.round((r.fixos + mediaAvulsos) * 100) / 100;
  const reserva = Object.values(S.economia).reduce((t, v) => t + (Number(v) || 0), 0);
  const catAvulso = {};
  itens.filter((i) => i.tipo === 'saida' && i.origem === 'avulso').forEach((i) => (catAvulso[i.categoria] = (catAvulso[i.categoria] || 0) + i.valor));
  const topAvulso = Object.entries(catAvulso).sort((a, b) => b[1] - a[1])[0] || null;
  // quanto as saídas fixas caem nos próximos 24 meses, quando parcelas acabam
  const liberacoes = parc.filter((p) => p.fim >= ymNum(ym)).map((p) => ({ quando: ymDeNum(p.fim + 1), valor: p.valor, descricao: p.descricao, forma: p.forma }))
    .filter((l) => ymNum(l.quando) <= ymNum(ym) + 36).sort((a, b) => ymNum(a.quando) - ymNum(b.quando));
  const entradasDatas = itens.filter((i) => i.tipo === 'entrada' && i.forma === 'dinheiro').map((i) => i.data);
  return { r, serie, negativos, dividas, totalDividas, parc, parcMes, maiorFixo, mediaAvulsos, custoMes, reserva, topAvulso, liberacoes, entradasDatas, itens };
}

function acoesDoPlano(D, ym) {
  const { r } = D, A = [];
  const renda = r.entradas;
  if (!renda) {
    A.push({ id: 'cadastrar', pri: 'alta', t: 'Cadastre seu salário e suas contas fixas', p: 'Sem isso o plano não tem como fazer conta. Vá em Contas e cadastre o que entra e o que sai todo mês, com o dia de cada um.' });
    return A;
  }
  if (!S.config.saldoDefinido) A.push({ id: 'saldo', pri: 'alta', t: 'Informe o saldo atual da conta', p: 'Em Ajustes, coloque quanto tem na conta hoje. Sem isso o termômetro começa do zero e os alertas de saldo negativo ficam errados.' });

  if (D.totalDividas > 0) {
    A.push({ id: 'dividas', pri: 'alta', t: `Quitar ou negociar ${brl(D.totalDividas)} em dívidas`, p: `Comece pela de juro mais alto: rotativo e cheque especial vêm antes de qualquer outra. Enquanto houver rotativo, cartão parado. Quando fechar um acordo, cadastre as parcelas em Contas como saída fixa e marque a dívida como "negociando".` });
  }
  if (r.sobra < 0) {
    A.push({ id: 'sobra-neg', pri: 'alta', t: `O mês fecha ${brl(-r.sobra)} no vermelho`, p: `Saem ${brl(r.fixos + r.avulsos)} e entram ${brl(renda)}. Antes de qualquer meta, é preciso cortar ou adiar pelo menos ${brl(-r.sobra)}. ${D.topAvulso ? `O maior grupo de gasto avulso é ${D.topAvulso[0]} (${brl(D.topAvulso[1])}), é o primeiro lugar para olhar.` : ''}` });
  }
  if (D.negativos.length) {
    const primeiro = D.negativos[0], proxEntrada = D.entradasDatas.find((d) => d > primeiro.data);
    const contasAntes = D.itens.filter((i) => i.tipo === 'saida' && i.forma === 'dinheiro' && i.origem === 'fixo' && i.data <= primeiro.data && i.data >= addDias(primeiro.data, -6)).sort((a, b) => b.valor - a.valor);
    A.push({ id: 'descasamento-' + ym, pri: 'alta', t: `Saldo negativo a partir de ${dataBR(primeiro.data)}`, p: `As contas vencem antes de o dinheiro entrar.${contasAntes.length ? ` Nos dias anteriores vencem ${contasAntes.slice(0, 3).map((c) => `${esc(c.descricao)} (${brl(c.valor)}, dia ${c.data.slice(8)})`).join(', ')}.` : ''}${proxEntrada ? ` A próxima entrada é em ${dataBR(proxEntrada)}: peça para mudar o vencimento da maior dessas contas para depois dessa data.` : ''} Mudar vencimento é de graça e evita juro de atraso e cheque especial.` });
  }
  if (r.cartao > 0 && (D.totalDividas > 0 || r.sobra < 0)) {
    A.push({ id: 'cartao-' + ym, pri: 'alta', t: `Segurar o cartão: ${brl(r.cartao)} lançados neste mês`, p: 'Cada compra no cartão hoje é dinheiro que já sai do próximo salário. Com dívida em aberto ou mês negativo, use só débito ou pix até a situação virar.' });
  }

  const pFixos = pct(r.fixos, renda);
  if (pFixos > 60) {
    A.push({ id: 'fixos', pri: 'media', t: `Contas fixas levam ${pFixos}% do que entra`, p: `São ${brl(r.fixos)} de ${brl(renda)}. Uma referência comum é deixar o essencial perto de 50% a 60% da renda, para sobrar espaço para o dia a dia e para guardar. Revise uma conta por mês: plano de celular, internet, assinaturas, seguros.` });
  }
  if (D.maiorFixo && pct(D.maiorFixo.valor, renda) >= 20) {
    A.push({ id: 'maior-fixo', pri: 'media', t: `${D.maiorFixo.descricao} sozinho consome ${pct(D.maiorFixo.valor, renda)}% da renda`, p: `São ${brl(D.maiorFixo.valor)} por mês. Se for financiamento, simule no app do banco a portabilidade para juro menor ou a amortização com algum dinheiro extra (13º, restituição). Reduzir prazo ou parcela de um item desse tamanho muda o mês inteiro.` });
  }
  if (D.parcMes > 0) {
    const pp = pct(D.parcMes, renda);
    A.push({ id: 'parcelas-' + ym, pri: pp > 30 ? 'media' : 'base', t: `Parcelas somam ${brl(D.parcMes)} neste mês (${pp}% da renda)`, p: `${pp > 15 ? 'Não abra parcelamento novo até esse número baixar.' : 'Está sob controle, mas evite empilhar parcelas novas.'} Falta pagar ${brl(D.parc.reduce((t, x) => t + x.restante, 0))} no total.${D.liberacoes.length ? ` A próxima a acabar é ${esc(D.liberacoes[0].descricao)}, em ${mesCurto(addMeses(D.liberacoes[0].quando, -1))}: a partir daí, direcione os ${brl(D.liberacoes[0].valor)} para a reserva em vez de deixar sumir no dia a dia.` : ''}` });
  }

  const meta1 = D.custoMes, falta1 = Math.max(0, meta1 - D.reserva);
  const sugestao = r.sobra > 0 ? Math.max(Math.min(r.sobra, renda * 0.1), Math.min(r.sobra, 50)) : 0;
  if (falta1 > 0) {
    A.push({ id: 'reserva1', pri: D.totalDividas > 0 || r.sobra < 0 ? 'base' : 'media', t: `Montar uma reserva de 1 mês (${brl(meta1)})`, p: sugestao > 0 ? `Guardando ${brl(sugestao)} por mês, assim que o salário cair, você chega lá em cerca de ${Math.ceil(falta1 / sugestao)} ${Math.ceil(falta1 / sugestao) === 1 ? 'mês' : 'meses'}. Deixe numa conta separada que rende todo dia e tem saque imediato, e anote o valor em Economia.` : 'Assim que o mês parar de fechar negativo, separe um valor fixo logo que o salário cair, mesmo que pequeno, e anote em Economia.' });
  } else {
    const meta6 = meta1 * 6;
    A.push({ id: 'reserva6', pri: 'base', t: `Levar a reserva para 6 meses (${brl(meta6)})`, p: `Você já tem ${brl(D.reserva)} anotados. ${sugestao > 0 ? `No ritmo de ${brl(sugestao)} por mês faltam cerca de ${Math.ceil(Math.max(0, meta6 - D.reserva) / sugestao)} meses.` : ''} Depois disso, o que sobrar pode ir para investimentos de prazo mais longo.` });
  }
  if (r.benefEnt > 0 && r.benefSai > r.benefEnt) {
    A.push({ id: 'vales-' + ym, pri: 'media', t: `Os vales não cobrem o que está previsto (${brl(r.benefSai - r.benefEnt)} a mais)`, p: 'A diferença sai do salário. Ajuste a lista de compras ao valor do vale ou registre a diferença como saída na conta para o termômetro ficar certo.' });
  }
  if (D.topAvulso && renda && pct(D.topAvulso[1], renda) >= 10) {
    A.push({ id: 'avulso-' + D.topAvulso[0], pri: 'media', t: `${D.topAvulso[0]} levou ${brl(D.topAvulso[1])} em gastos avulsos`, p: `É ${pct(D.topAvulso[1], renda)}% da renda. Defina um teto por mês para essa categoria e acompanhe em Lançar.` });
  }
  if (!Object.keys(S.economia).length) {
    A.push({ id: 'anotar', pri: 'base', t: 'Anote todo mês quanto guardou de verdade', p: 'Em Economia, no fim de cada mês, registre o valor que foi para a reserva. É a única forma de saber se o plano está funcionando, e não só no papel.' });
  }
  A.push({ id: 'rotina', pri: 'base', t: 'Rotina de 10 minutos por semana', p: 'Lance os gastos da semana (ou leia o PDF da fatura), confira o termômetro dos próximos dias e marque as contas pagas no Painel. Uma vez por mês, acerte o saldo com o extrato em Ajustes.' });
  const ordem = { alta: 0, media: 1, base: 2 };
  return A.sort((a, b) => ordem[a.pri] - ordem[b.pri]);
}

function addDias(iso, n) { const d = new Date(iso + 'T12:00'); d.setDate(d.getDate() + n); return isoDe(d.getFullYear(), d.getMonth() + 1, d.getDate()); }

VIEWS.plano = () => {
  // o mês do saldo inicial costuma estar pela metade; o plano olha o primeiro mês completo
  const mesSaldo = S.config.dataSaldo.slice(0, 7), parcial = S.config.dataSaldo.slice(8) !== '01' && ymNum(ui.mes) <= ymNum(mesSaldo);
  const ym = parcial ? addMeses(mesSaldo, 1) : ui.mes, D = diagnostico(ym), acoes = acoesDoPlano(D, ym), r = D.r;
  const fase = !r.entradas ? 0 : (D.totalDividas > 0 || r.sobra < 0 || D.negativos.length) ? 1 : D.reserva < D.custoMes * 3 ? 2 : 3;
  const fases = [
    ['Sair do aperto', 'Mês fechando positivo, sem dívida cara e sem saldo negativo.'],
    ['Criar um colchão', 'Reserva de 1 a 3 meses de custo para imprevistos.'],
    ['Fazer o dinheiro trabalhar', 'Reserva de 6 meses e investimento todo mês.']
  ];
  const meta = D.custoMes * (fase <= 2 ? (D.reserva >= D.custoMes ? 3 : 1) : 6);
  const prog = meta ? Math.min(100, (D.reserva / meta) * 100) : 0;
  const prox = Array.from({ length: 12 }, (_, k) => addMeses(ym, k));
  const feitas = acoes.filter((a) => S.plano[a.id]).length;
  return `<div class="stack">
    <div class="card">
      <div class="card-head"><h2>Seu plano a partir de ${nomeMes(ym)}</h2><span class="small muted">Recalculado sempre que seus dados mudam</span></div>
      ${parcial ? `<p class="small muted" style="margin:-4px 0 12px">A análise usa ${nomeMes(ym)} porque é o primeiro mês inteiro depois do saldo que você informou.</p>` : ''}
      <div class="phase-row">${fases.map(([t, d], i) => `<div class="phase ${fase === i + 1 ? 'on' : ''} ${fase > i + 1 ? 'feito' : ''}">
        <div class="ph-n">Fase ${i + 1}${fase === i + 1 ? ' · você está aqui' : fase > i + 1 ? ' · concluída' : ''}</div><div class="ph-t">${t}</div><div class="ph-d">${d}</div></div>`).join('')}</div>
    </div>
    <div class="grid tiles">
      <div class="card tile"><div class="label">Entra no mês</div><div class="value num">${brl(r.entradas)}</div><div class="sub">Salário e extras na conta</div></div>
      <div class="card tile"><div class="label">Custo do mês</div><div class="value num">${brl(D.custoMes)}</div><div class="sub">Fixos mais média de avulsos</div></div>
      <div class="card tile"><div class="label">Sobra</div><div class="value num ${r.sobra < 0 ? 'neg' : 'pos'}">${brl(r.sobra)}</div><div class="sub">${r.entradas ? pct(r.sobra, r.entradas) + '% da renda' : ''}</div></div>
      <div class="card tile"><div class="label">Reserva anotada</div><div class="value num">${brl(D.reserva)}</div>
        <div class="progress" aria-label="Progresso da meta"><span style="width:${prog}%"></span></div><div class="sub">Meta atual ${brl(meta)}</div></div>
    </div>
    <div class="card">
      <div class="card-head"><h2>O que fazer, em ordem</h2><span class="small muted">${feitas} de ${acoes.length} feitas</span></div>
      ${acoes.map((a) => `<div class="acao ${S.plano[a.id] ? 'done' : ''}">
        <input type="checkbox" class="check" data-plano="${a.id}" ${S.plano[a.id] ? 'checked' : ''} aria-label="Marcar como feito" style="margin-top:2px">
        <div style="flex:1;min-width:0"><h3>${esc(a.t)}</h3><p>${a.p}</p></div>
        <span class="pri ${a.pri}">${{ alta: 'Agora', media: 'Em seguida', base: 'Depois' }[a.pri]}</span></div>`).join('')}
    </div>
    <div class="card">
      <div class="card-head"><h2>Próximos 12 meses</h2></div>
      <p class="small muted" style="margin:-4px 0 10px">Projeção com as contas e parcelas cadastradas hoje. Mostra quando as parcelas acabam e o dinheiro fica livre.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Mês</th><th class="r">Entradas</th><th class="r">Fixos</th><th class="r">Sobra</th><th class="r">Saldo no fim</th><th class="hide-sm">Acaba</th></tr></thead>
        <tbody>${prox.map((m) => { const rr = resumoDoMes(m), f = serieDoMes(m).fim, acaba = D.liberacoes.filter((l) => addMeses(l.quando, -1) === m);
          return `<tr class="clickable" data-abrir-mes="${m}" data-ir="termometro"><td>${mesCurto(m)}</td><td class="r num">${brl(rr.entradas)}</td><td class="r num">${brl(rr.fixos)}</td>
          <td class="r num ${rr.sobra < 0 ? 'neg' : 'pos'}">${brl(rr.sobra)}</td><td class="r"><span class="band b${faixa(f)} num">${f === null ? 'sem dado' : brl(f)}</span></td>
          <td class="small muted hide-sm">${acaba.map((l) => `${esc(l.descricao)} (libera ${brl(l.valor)})`).join(', ')}</td></tr>`; }).join('')}</tbody>
      </table></div>
      <p class="small muted" style="margin:10px 0 0">Gastos avulsos futuros não estão na projeção, só o que já foi lançado. Por isso os meses à frente tendem a parecer melhores do que vão ser.</p>
    </div>
  </div>`;
};

/* ---------- Mais (celular) ---------- */
VIEWS.mais = () => `<div class="card mais-list">
  <button class="nav-item" data-view="contas"><span class="ni">&#9776;</span><span>Contas fixas, vales e dívidas</span></button>
  <button class="nav-item" data-view="economia"><span class="ni">&#9650;</span><span>Economia do ano</span></button>
  <button class="nav-item" data-view="ajustes"><span class="ni">&#9881;</span><span>Ajustes, instalar e backup</span></button>
</div>`;

/* ---------- Contas (plano de contas) ---------- */
VIEWS.contas = () => {
  const [y, m] = ui.mes.split('-').map(Number);
  const valorNoMes = (r) => ocorrenciasRecorrente(r, y, m).length * Number(r.valor);
  const ordenar = (lista) => lista.slice().sort((a, b) => (Number(a.dia) || 0) - (Number(b.dia) || 0));
  const quando = (r) => r.freq === 'semanal' ? `toda ${DIAS_SEMANA[r.diaSemana]}` : r.diaUtil ? `${r.dia}º dia útil` : `dia ${r.dia}`;
  const prazo = (r) => {
    const { ini, fim } = limitesRecorrente(r), atual = ymNum(ui.mes);
    if (r.ativo === false) return ' · pausada';
    if (atual < ini) return ` · começa em ${mesCurto(ymDeNum(ini))}`;
    if (atual > fim) return ' · encerrada';
    if (r.parcelas) return ` · parcela ${atual - ini + 1} de ${r.parcelas}`;
    if (r.fim) return ` · até ${mesCurto(r.fim)}`;
    return '';
  };
  const lista = (itens, vazio) => itens.length ? `<ul class="list">${ordenar(itens).map((r) => {
    const v = valorNoMes(r);
    return `<li class="clickable" data-edit="fixo" data-id="${r.id}">
      <div class="date-chip">${r.freq === 'semanal' ? '<b>7d</b>' : `<b>${pad(r.dia)}</b>${r.diaUtil ? 'útil' : 'dia'}`}</div>
      <div class="grow"><div class="title">${esc(r.descricao)}${tagForma(r.forma)}</div><div class="meta">${esc(r.categoria || '')} · ${quando(r)}${prazo(r)}</div></div>
      <div style="text-align:right"><div class="num ${v ? '' : 'muted'}">${brl(v || Number(r.valor))}</div>${r.freq === 'semanal' ? `<div class="meta num">${brl(r.valor)} por semana</div>` : ''}</div></li>`;
  }).join('')}</ul>` : `<p class="empty">${vazio}</p>`;

  const din = S.recorrentes.filter((r) => (r.forma || 'dinheiro') === 'dinheiro');
  const ent = din.filter((r) => r.tipo === 'entrada'), sai = din.filter((r) => r.tipo === 'saida');
  const outros = S.recorrentes.filter((r) => (r.forma || 'dinheiro') !== 'dinheiro');
  const tEnt = ent.reduce((t, r) => t + valorNoMes(r), 0), tSai = sai.reduce((t, r) => t + valorNoMes(r), 0);
  const dividas = S.dividas.slice().sort((a, b) => (a.status === 'quitada') - (b.status === 'quitada'));

  return `<div class="stack">
    <div class="grid tiles">
      <div class="card tile"><div class="label">Entradas fixas</div><div class="value num pos">${brl(tEnt)}</div><div class="sub">Em ${nomeMes(ui.mes)}</div></div>
      <div class="card tile"><div class="label">Saídas fixas</div><div class="value num">${brl(tSai)}</div><div class="sub">Só o que sai da conta</div></div>
      <div class="card tile"><div class="label">Sobra antes dos avulsos</div><div class="value num ${tEnt - tSai < 0 ? 'neg' : 'pos'}">${brl(tEnt - tSai)}</div><div class="sub">Para gastos do dia a dia</div></div>
      <div class="card tile"><div class="label">Dívidas em aberto</div><div class="value num">${brl(soma(S.dividas.filter((d) => d.status !== 'quitada')))}</div><div class="sub">Fora do fluxo mensal</div></div>
    </div>
    <div class="grid two">
      <div class="card"><div class="card-head"><h2>Entradas fixas</h2><button class="btn sm" data-novo-fixo="entrada">+ Entrada</button></div>
        <p class="small muted" style="margin:-4px 0 6px">Só o que é certo todo mês. Bico ou comissão incerta fica de fora e entra como lançamento quando cair.</p>
        ${lista(ent, 'Cadastre seu salário aqui.')}</div>
      <div class="card"><div class="card-head"><h2>Saídas fixas</h2><button class="btn sm" data-novo-fixo="saida">+ Saída</button></div>
        <p class="small muted" style="margin:-4px 0 6px">Contas que saem da conta todo mês ou toda semana, inclusive parcelas.</p>
        ${lista(sai, 'Cadastre aluguel, luz, internet, financiamentos.')}</div>
    </div>
    <div class="grid two">
      <div class="card"><div class="card-head"><h2>Vales e cartão</h2><button class="btn sm" data-novo-fixo="beneficio">+ Vale</button></div>
        <p class="small muted" style="margin:-4px 0 6px">Vales e compras recorrentes no cartão ficam registrados, mas não mexem no saldo da conta. A fatura do cartão entra como saída quando você for pagar.</p>
        ${lista(outros, 'Nenhum vale ou assinatura no cartão.')}</div>
      <div class="card"><div class="card-head"><h2>Dívidas</h2><button class="btn sm" data-action="nova-divida">+ Dívida</button></div>
        <p class="small muted" style="margin:-4px 0 6px">Dívidas atrasadas ou em negociação ficam aqui, separadas. Quando fechar um acordo, cadastre as parcelas como saída fixa.</p>
        ${dividas.length ? `<ul class="list">${dividas.map((d) => `<li class="clickable ${d.status === 'quitada' ? 'done' : ''}" data-edit="divida" data-id="${d.id}">
          <div class="grow"><div class="title">${esc(d.descricao)}</div><div class="meta">${esc(d.credor || '')} · ${({ aberta: 'em aberto', negociando: 'negociando', quitada: 'quitada' })[d.status] || ''}${d.obs ? ' · ' + esc(d.obs) : ''}</div></div>
          <div class="num">${brl(d.valor)}</div></li>`).join('')}</ul>` : '<p class="empty">Nenhuma dívida registrada.</p>'}</div>
    </div>
  </div>`;
};

/* ---------- Economia ---------- */
VIEWS.economia = () => {
  const ano = ui.mes.slice(0, 4);
  let tEnt = 0, tSobra = 0, tReal = 0;
  const linhas = Array.from({ length: 12 }, (_, i) => {
    const ym = `${ano}-${pad(i + 1)}`, r = resumoDoMes(ym), real = S.economia[ym];
    tEnt += r.entradas; tSobra += r.sobra; if (real) tReal += Number(real);
    const pct = r.entradas && real ? (Number(real) / r.entradas) * 100 : null;
    return `<tr><td style="text-transform:capitalize">${NOMES_MES[i]}</td>
      <td class="r num">${brl(r.entradas)}</td>
      <td class="r num ${r.sobra < 0 ? 'neg' : ''}">${brl(r.sobra)}</td>
      <td class="r"><input class="inline num" inputmode="decimal" data-economia="${ym}" value="${valorCampo(real)}" placeholder="0,00" aria-label="Guardado em ${NOMES_MES[i]}"></td>
      <td class="r num">${pct === null ? '' : pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'}</td></tr>`;
  }).join('');
  const pctAno = tEnt && tReal ? ((tReal / tEnt) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%' : '';
  return `<div class="stack">
    <div class="grid tiles">
      <div class="card tile"><div class="label">Guardado em ${ano}</div><div class="value num pos">${brl(tReal)}</div><div class="sub">O que você anotou</div></div>
      <div class="card tile"><div class="label">Taxa de poupança</div><div class="value num">${pctAno || '0%'}</div><div class="sub">Do que entrou no ano</div></div>
      <div class="card tile"><div class="label">Sobra projetada</div><div class="value num ${tSobra < 0 ? 'neg' : ''}">${brl(tSobra)}</div><div class="sub">Pelo plano de contas</div></div>
      <div class="card tile"><div class="label">Entradas no ano</div><div class="value num">${brl(tEnt)}</div><div class="sub">Salário e extras</div></div>
    </div>
    <div class="card">
      <div class="card-head"><h2>Economia de ${ano}</h2></div>
      <p class="small muted" style="margin:-4px 0 10px">A sobra projetada vem das contas. Na coluna "Guardado de fato" anote no fim de cada mês quanto você realmente separou. A diferença entre as duas mostra se o plano está sendo cumprido.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Mês</th><th class="r">Entradas</th><th class="r">Sobra projetada</th><th class="r">Guardado de fato</th><th class="r">% da renda</th></tr></thead>
        <tbody>${linhas}</tbody>
        <tfoot><tr><td>Ano</td><td class="r num">${brl(tEnt)}</td><td class="r num">${brl(tSobra)}</td><td class="r num">${brl(tReal)}</td><td class="r num">${pctAno}</td></tr></tfoot>
      </table></div>
    </div>
  </div>`;
};

/* ---------- Ajustes ---------- */
let eventoInstalar = null;
VIEWS.ajustes = () => {
  const c = S.config, instalado = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  return `<div class="stack">
    <form class="card" id="formSaldo">
      <div class="card-head"><h2>Saldo da conta</h2></div>
      <p class="small muted" style="margin:-4px 0 12px">Quanto tem na conta no fim do dia escolhido. O termômetro projeta a partir daqui. Sempre que quiser acertar com o extrato do banco, atualize os dois campos.</p>
      <div class="row">
        <label class="field"><span>Saldo (R$)</span><input name="saldo" inputmode="decimal" value="${valorCampo(c.saldoInicial)}" required></label>
        <label class="field"><span>Em qual dia</span><input type="date" name="data" value="${c.dataSaldo}" required></label>
      </div>
      <div style="margin-top:12px"><button class="btn primary" type="submit">Salvar saldo</button></div>
    </form>

    <form class="card" id="formFaixas">
      <div class="card-head"><h2>Faixas do termômetro</h2></div>
      <p class="small muted" style="margin:-4px 0 12px">Os limites que separam as cores. Ajuste para o seu padrão de gasto: se um mês normal seu custa R$ 3.000, ter R$ 1.000 na conta já é apertado.</p>
      <div class="row">
        <label class="field"><span>Crítico abaixo de</span><input name="f0" inputmode="decimal" value="${valorCampo(c.faixas[0])}"></label>
        <label class="field"><span>Negativo abaixo de</span><input name="f1" inputmode="decimal" value="${valorCampo(c.faixas[1])}"></label>
        <label class="field"><span>Apertado abaixo de</span><input name="f2" inputmode="decimal" value="${valorCampo(c.faixas[2])}"></label>
        <label class="field"><span>Tranquilo abaixo de</span><input name="f3" inputmode="decimal" value="${valorCampo(c.faixas[3])}"></label>
      </div>
      <label style="display:flex;gap:8px;align-items:center;margin-top:14px"><input type="checkbox" class="check" name="sabado" ${c.sabadoUtil ? 'checked' : ''}> Contar sábado como dia útil (para salário no "5º dia útil")</label>
      <div style="margin-top:12px"><button class="btn primary" type="submit">Salvar ajustes</button></div>
    </form>

    <div class="card">
      <div class="card-head"><h2>Instalar o app</h2></div>
      ${instalado ? '<p>O app já está instalado neste aparelho.</p>' : `
      ${eventoInstalar ? '<p><button class="btn primary" data-action="instalar">Instalar neste aparelho</button></p>' : ''}
      <p class="small"><b>Computador (Chrome ou Edge):</b> clique no ícone de instalar na barra de endereço, ou no menu ⋮ e depois em "Instalar OrgFin".</p>
      <p class="small"><b>Android (Chrome):</b> menu ⋮ e depois "Adicionar à tela inicial" ou "Instalar app".</p>
      <p class="small"><b>iPhone (Safari):</b> botão de compartilhar e depois "Adicionar à Tela de Início".</p>`}
      <p class="small muted">Depois de instalado, funciona sem internet.</p>
    </div>

    <div class="card">
      <div class="card-head"><h2>Seus dados</h2></div>
      <p class="small muted" style="margin:-4px 0 12px">Tudo fica salvo só neste aparelho, nada vai para a internet. Por isso o computador e o celular não se sincronizam sozinhos: exporte o backup num e importe no outro. Faça um backup de vez em quando.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" data-action="exportar">Exportar backup</button>
        <label class="btn">Importar backup<input type="file" accept="application/json,.json" id="importar" hidden></label>
        <button class="btn danger" data-action="apagar-tudo">Apagar tudo</button>
      </div>
    </div>
  </div>`;
};

/* ================= Formulários ================= */

const dlg = $('#dialog'), dlgForm = $('#dialogForm');
let aoSalvar = null, aoExcluir = null;

function abrirForm(titulo, corpo, salvarFn, excluirFn) {
  dlgForm.innerHTML = `<div class="dlg-head"><h2>${titulo}</h2><button type="button" class="icon-btn" data-fechar aria-label="Fechar">×</button></div>
    <div class="dlg-body">${corpo}</div>
    <div class="dlg-foot">${excluirFn ? '<button type="button" class="btn danger" data-excluir>Excluir</button>' : ''}<span class="spacer"></span>
      <button type="button" class="btn" data-fechar>Cancelar</button><button type="submit" class="btn primary">Salvar</button></div>`;
  aoSalvar = salvarFn; aoExcluir = excluirFn;
  dlg.showModal();
  atualizarCamposForm();
  const primeiro = dlgForm.querySelector('[autofocus]'); if (primeiro) primeiro.focus();
}

dlgForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const dados = Object.fromEntries(new FormData(dlgForm));
  dlgForm.querySelectorAll('input[type=checkbox]').forEach((c) => (dados[c.name] = c.checked));
  const erro = aoSalvar(dados);
  if (erro) { toast(erro); return; }
  dlg.close(); salvar(); render();
});
dlgForm.addEventListener('click', (e) => {
  if (e.target.closest('[data-fechar]')) dlg.close();
  if (e.target.closest('[data-excluir]') && confirm('Excluir este item?')) { aoExcluir(); dlg.close(); salvar(); render(); }
});
dlgForm.addEventListener('change', atualizarCamposForm);
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

// Mostra ou esconde campos conforme as escolhas do formulário
function atualizarCamposForm(ev) {
  const f = ev && ev.target && ev.target.form ? ev.target.form : dlgForm, tipo = f.querySelector('input[name=tipo]:checked');
  const freq = f.querySelector('select[name=freq]');
  if (freq) {
    f.querySelector('[data-campo=mensal]').hidden = freq.value !== 'mensal';
    f.querySelector('[data-campo=semanal]').hidden = freq.value !== 'semanal';
    const parc = f.querySelector('[data-campo=parcelas]'); if (parc) parc.hidden = freq.value !== 'mensal';
  }
  const cat = f.querySelector('select[name=categoria]');
  if (cat && tipo) {
    const lista = tipo.value === 'entrada' ? CATEGORIAS_ENTRADA : CATEGORIAS_SAIDA, atual = cat.value;
    if (!lista.includes(atual) || cat.dataset.tipo !== tipo.value) {
      cat.innerHTML = lista.map((c) => `<option ${c === atual ? 'selected' : ''}>${c}</option>`).join('');
      cat.dataset.tipo = tipo.value;
    }
  }
}

const radio = (nome, opcoes, atual) => `<div class="radio-row">${Object.entries(opcoes).map(([v, t]) =>
  `<label><input type="radio" name="${nome}" value="${v}" ${v === atual ? 'checked' : ''}>${t}</label>`).join('')}</div>`;
const selectCat = (tipo, atual) => {
  const lista = tipo === 'entrada' ? CATEGORIAS_ENTRADA : CATEGORIAS_SAIDA;
  return `<select name="categoria" data-tipo="${tipo}">${lista.map((c) => `<option ${c === atual ? 'selected' : ''}>${c}</option>`).join('')}</select>`;
};
const selectForma = (atual) => `<select name="forma">${Object.entries(FORMAS).map(([v, t]) => `<option value="${v}" ${v === atual ? 'selected' : ''}>${t}</option>`).join('')}</select>`;

function lancamentoPadrao(dataPadrao) {
  return { tipo: 'saida', data: dataPadrao || padraoData(), forma: 'dinheiro', categoria: 'Outros', parcelas: 1 };
}

function camposLancamento(l, foco) {
  return `
    ${radio('tipo', { saida: 'Gasto', entrada: 'Entrada' }, l.tipo)}
    <div class="row">
      <label class="field"><span>Valor${Number(l.parcelas) > 1 ? ' de cada parcela' : ''} (R$)</span><input name="valor" inputmode="decimal" value="${valorCampo(l.valor)}" placeholder="0,00" required ${foco ? 'autofocus' : ''}></label>
      <label class="field"><span>Descrição</span><input name="descricao" value="${esc(l.descricao)}" placeholder="Ex.: farmácia, uber, padaria" required></label>
    </div>
    <div class="row">
      <label class="field"><span>Data</span><input type="date" name="data" value="${l.data}" required></label>
      <label class="field"><span>Categoria</span>${selectCat(l.tipo, l.categoria)}</label>
    </div>
    <div class="row">
      <label class="field"><span>Pago com</span>${selectForma(l.forma)}</label>
      <label class="field"><span>Parcelas</span><input type="number" name="parcelas" min="1" max="72" value="${l.parcelas || 1}"></label>
    </div>
    <p class="hint">Se for parcelado, informe o valor de cada parcela. Ele aparece em todos os meses até a última.</p>`;
}

function salvarLancamento(d, existente) {
  const valor = lerValor(d.valor);
  if (!(valor > 0)) return 'Informe um valor maior que zero.';
  if (!String(d.descricao || '').trim()) return 'Informe uma descrição.';
  const reg = { id: existente ? existente.id : uid(), tipo: d.tipo, valor, descricao: d.descricao.trim(), data: d.data, categoria: d.categoria, forma: d.forma, parcelas: Math.max(1, parseInt(d.parcelas, 10) || 1) };
  if (existente) Object.assign(S.lancamentos.find((x) => x.id === existente.id), reg); else S.lancamentos.push(reg);
  toast(existente ? 'Alterado' : 'Lançamento salvo');
}

function formLancamento(l, dataPadrao) {
  const novo = !l;
  abrirForm(novo ? 'Novo lançamento' : 'Editar lançamento', camposLancamento(l || lancamentoPadrao(dataPadrao), true),
    (d) => salvarLancamento(d, l),
    novo ? null : () => { S.lancamentos = S.lancamentos.filter((x) => x.id !== l.id); });
}

function formRecorrente(r, modo) {
  const novo = !r;
  if (!r) {
    r = { tipo: modo === 'entrada' ? 'entrada' : 'saida', forma: modo === 'beneficio' ? 'beneficio' : 'dinheiro', freq: 'mensal', dia: 5, diaSemana: 1, inicio: ui.mes, categoria: modo === 'entrada' ? 'Salário' : modo === 'beneficio' ? 'Benefício' : 'Contas da casa' };
    if (modo === 'beneficio') r.tipo = 'entrada';
  }
  const meses = Array.from({ length: 72 }, (_, i) => ymDeNum(ymNum(mesISO(new Date())) - 12 + i));
  if (r.inicio && !meses.includes(r.inicio)) meses.unshift(r.inicio);
  abrirForm(novo ? 'Nova conta fixa' : 'Editar conta fixa', `
    ${radio('tipo', { saida: 'Saída', entrada: 'Entrada' }, r.tipo)}
    <label class="field"><span>Descrição</span><input name="descricao" value="${esc(r.descricao)}" placeholder="Ex.: luz, salário, financiamento do carro" required autofocus></label>
    <div class="row">
      <label class="field"><span>Valor (R$)</span><input name="valor" inputmode="decimal" value="${valorCampo(r.valor)}" placeholder="0,00" required></label>
      <label class="field"><span>Categoria</span>${selectCat(r.tipo, r.categoria)}</label>
    </div>
    <div class="row">
      <label class="field"><span>Repete</span><select name="freq">
        <option value="mensal" ${r.freq !== 'semanal' ? 'selected' : ''}>Todo mês</option>
        <option value="semanal" ${r.freq === 'semanal' ? 'selected' : ''}>Toda semana</option></select></label>
      <label class="field"><span>Sai de / entra em</span>${selectForma(r.forma || 'dinheiro')}</label>
    </div>
    <div data-campo="mensal" class="row">
      <label class="field"><span>Dia do mês</span><input type="number" name="dia" min="1" max="31" value="${r.dia || 1}"></label>
      <label class="field" style="align-self:end"><span></span><label style="display:flex;gap:8px;align-items:center;padding:9px 0"><input type="checkbox" class="check" name="diaUtil" ${r.diaUtil ? 'checked' : ''}> Contar como dia útil</label></label>
    </div>
    <p data-campo="mensal" class="hint" style="margin-top:-6px">Marque "dia útil" para salário que cai, por exemplo, no 5º dia útil. Se o mês tiver menos dias, vale o último.</p>
    <label data-campo="semanal" class="field"><span>Dia da semana</span><select name="diaSemana">${DIAS_SEMANA.map((d, i) => `<option value="${i}" ${Number(r.diaSemana) === i ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
    <div class="row">
      <label class="field"><span>Começa em</span><select name="inicio">${meses.map((m) => `<option value="${m}" ${m === r.inicio ? 'selected' : ''}>${mesCurto(m)}</option>`).join('')}</select></label>
      <label class="field" data-campo="parcelas"><span>Número de parcelas</span><input type="number" name="parcelas" min="0" max="480" value="${r.parcelas || ''}" placeholder="Sem fim"></label>
    </div>
    <p class="hint" style="margin-top:-6px">Para financiamentos e parcelamentos, informe quantas parcelas faltam a partir do mês de início. Deixe em branco se não tiver fim.</p>
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" class="check" name="pausada" ${r.ativo === false ? 'checked' : ''}> Pausada (não entra nas contas)</label>
    <label class="field"><span>Observação</span><input name="obs" value="${esc(r.obs)}" placeholder="Opcional"></label>`,
  (d) => {
    const valor = lerValor(d.valor);
    if (!(valor > 0)) return 'Informe um valor maior que zero.';
    const reg = {
      id: r.id || uid(), tipo: d.tipo, descricao: d.descricao.trim(), valor, categoria: d.categoria, forma: d.forma,
      freq: d.freq, dia: Math.min(31, Math.max(1, parseInt(d.dia, 10) || 1)), diaUtil: !!d.diaUtil, diaSemana: Number(d.diaSemana),
      inicio: d.inicio, parcelas: d.freq === 'mensal' && parseInt(d.parcelas, 10) > 0 ? parseInt(d.parcelas, 10) : null,
      ativo: !d.pausada, obs: d.obs.trim()
    };
    if (novo) S.recorrentes.push(reg); else Object.assign(S.recorrentes.find((x) => x.id === r.id), reg);
    toast(novo ? 'Conta salva' : 'Alterada');
  },
  novo ? null : () => { S.recorrentes = S.recorrentes.filter((x) => x.id !== r.id); });
}

function formDivida(dv) {
  const novo = !dv;
  dv = dv || { status: 'aberta' };
  abrirForm(novo ? 'Nova dívida' : 'Editar dívida', `
    <label class="field"><span>Descrição</span><input name="descricao" value="${esc(dv.descricao)}" placeholder="Ex.: rotativo do cartão" required autofocus></label>
    <div class="row">
      <label class="field"><span>Valor (R$)</span><input name="valor" inputmode="decimal" value="${valorCampo(dv.valor)}" required></label>
      <label class="field"><span>Credor</span><input name="credor" value="${esc(dv.credor)}" placeholder="Banco ou loja"></label>
    </div>
    ${radio('status', { aberta: 'Em aberto', negociando: 'Negociando', quitada: 'Quitada' }, dv.status)}
    <label class="field"><span>Observação</span><input name="obs" value="${esc(dv.obs)}" placeholder="Opcional"></label>`,
  (d) => {
    const valor = lerValor(d.valor);
    if (!(valor >= 0)) return 'Informe o valor.';
    const reg = { id: dv.id || uid(), descricao: d.descricao.trim(), valor, credor: d.credor.trim(), status: d.status, obs: d.obs.trim() };
    if (novo) S.dividas.push(reg); else Object.assign(S.dividas.find((x) => x.id === dv.id), reg);
  },
  novo ? null : () => { S.dividas = S.dividas.filter((x) => x.id !== dv.id); });
}

function padraoData() {
  const hoje = hojeISO();
  return hoje.slice(0, 7) === ui.mes ? hoje : ui.mes + '-01';
}

function detalheDia(data) {
  const dia = serieDoMes(data.slice(0, 7)).dias.find((d) => d.data === data);
  if (!dia) return;
  abrirForm(`Dia ${dataBRCompleta(data)}`, `
    <p>Saldo no fim do dia: <span class="band b${faixa(dia.saldo)} num">${dia.saldo === null ? 'sem dado' : brl(dia.saldo)}</span></p>
    ${dia.itens.length ? `<ul class="list">${dia.itens.map((i) => `<li class="clickable" data-edit="${i.origem}" data-id="${i.id}">
      <div class="grow"><div class="title">${esc(i.descricao)}${tagForma(i.forma)}${tagParcela(i)}</div><div class="meta">${i.origem === 'fixo' ? 'Conta fixa' : 'Lançamento'} · ${esc(i.categoria || '')}</div></div>
      <div class="num ${i.tipo === 'entrada' ? 'pos' : ''}">${i.tipo === 'entrada' ? '+' : '−'} ${brl(i.valor)}</div></li>`).join('')}</ul>` : '<p class="empty">Nada previsto neste dia.</p>'}`,
  () => { dlg.close(); setTimeout(() => formLancamento(null, data), 0); return 'abrindo'; });
  const salvarBtn = dlgForm.querySelector('button[type=submit]'); salvarBtn.textContent = '+ Lançar neste dia';
}

/* ================= Eventos ================= */

document.addEventListener('click', (e) => {
  const t = e.target;
  const nav = t.closest('[data-view]');
  if (nav) { ir(nav.dataset.view); return; }
  const go = t.closest('[data-go]');
  if (go) { ir(go.dataset.go); return; }

  const a = t.closest('[data-action]');
  if (a) {
    const acao = a.dataset.action;
    if (acao === 'mes-anterior') mudarMes(-1);
    else if (acao === 'mes-seguinte') mudarMes(1);
    else if (acao === 'mes-atual') { ui.mes = mesISO(new Date()); render(); }
    else if (acao === 'novo-lancamento') formLancamento();
    else if (acao === 'nova-divida') formDivida();
    else if (acao === 'exportar') exportar();
    else if (acao === 'apagar-tudo') apagarTudo();
    else if (acao === 'pdf-salvar') salvarPdf();
    else if (acao === 'pdf-cancelar') { ui.pdf = null; render(); }
    else if (acao === 'instalar' && eventoInstalar) { eventoInstalar.prompt(); eventoInstalar.userChoice.finally(() => { eventoInstalar = null; render(); }); }
    return;
  }

  if (dlg.open && !dlg.contains(t)) return;
  const ed = t.closest('[data-edit]');
  if (ed) {
    if (dlg.open) dlg.close();
    const id = ed.dataset.id, tipo = ed.dataset.edit;
    if (tipo === 'avulso') formLancamento(S.lancamentos.find((x) => x.id === id));
    else if (tipo === 'fixo') formRecorrente(S.recorrentes.find((x) => x.id === id));
    else if (tipo === 'divida') formDivida(S.dividas.find((x) => x.id === id));
    return;
  }
  const nf = t.closest('[data-novo-fixo]');
  if (nf) { formRecorrente(null, nf.dataset.novoFixo); return; }
  const tm = t.closest('[data-termo]');
  if (tm) { ui.termoModo = tm.dataset.termo; render(); return; }
  const am = t.closest('[data-abrir-mes]');
  if (am) { ui.mes = am.dataset.abrirMes; ui.termoModo = 'mes'; if (am.dataset.ir) ir(am.dataset.ir); else render(); return; }
  const dd = t.closest('[data-dia]');
  if (dd && !dlg.open) { detalheDia(dd.dataset.dia); return; }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.pago) {
    if (t.checked) S.pagos[t.dataset.pago] = true; else delete S.pagos[t.dataset.pago];
    salvar(); render();
  } else if (t.dataset.economia) {
    const v = lerValor(t.value);
    if (t.value.trim() === '') delete S.economia[t.dataset.economia];
    else if (Number.isFinite(v)) S.economia[t.dataset.economia] = v;
    salvar(); render();
  } else if (t.id === 'importar' && t.files[0]) importar(t.files[0]);
  else if (t.id === 'pdfArquivo' && t.files[0]) { lerPdf(t.files[0]); t.value = ''; }
  else if (t.dataset.plano) {
    if (t.checked) S.plano[t.dataset.plano] = true; else delete S.plano[t.dataset.plano];
    salvar(); render();
  } else if (t.dataset.pdf !== undefined && ui.pdf) {
    const item = ui.pdf.itens[Number(t.dataset.pdf)], campo = t.dataset.campo;
    item[campo] = t.type === 'checkbox' ? t.checked : campo === 'valor' ? lerValor(t.value) : t.value;
    if (campo === 'marcado' || campo === 'valor') { $('#pdfRevisao').innerHTML = revisaoPdf(); }
  } else if (t.form && t.form.id === 'formLancar') atualizarCamposForm(e);
  else if (t.name === 'pdfTipo') ui.pdfTipo = t.value;
});

// arrastar PDF
document.addEventListener('dragover', (e) => { const d = e.target.closest && e.target.closest('#drop'); if (d) { e.preventDefault(); d.classList.add('over'); } });
document.addEventListener('dragleave', (e) => { const d = e.target.closest && e.target.closest('#drop'); if (d) d.classList.remove('over'); });
document.addEventListener('drop', (e) => {
  const d = e.target.closest && e.target.closest('#drop');
  if (!d) return;
  e.preventDefault(); d.classList.remove('over');
  if (e.dataTransfer.files[0]) lerPdf(e.dataTransfer.files[0]);
});

document.addEventListener('submit', (e) => {
  if (e.target.id === 'formLancar') {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    const erro = salvarLancamento(d, null);
    if (erro) { toast(erro); return; }
    salvar(); render();
    const v = $('#formLancar input[name=valor]'); if (v) v.focus();
  } else if (e.target.id === 'formSaldo') {
    e.preventDefault();
    const d = new FormData(e.target), v = lerValor(d.get('saldo'));
    if (!Number.isFinite(v)) { toast('Saldo inválido'); return; }
    S.config.saldoInicial = v; S.config.dataSaldo = d.get('data'); S.config.saldoDefinido = true;
    salvar(); render(); toast('Saldo atualizado');
  } else if (e.target.id === 'formFaixas') {
    e.preventDefault();
    const d = new FormData(e.target), f = ['f0', 'f1', 'f2', 'f3'].map((k) => lerValor(d.get(k)));
    if (f.some((x) => !Number.isFinite(x)) || !(f[0] < f[1] && f[1] < f[2] && f[2] < f[3])) { toast('Os limites precisam estar em ordem crescente'); return; }
    S.config.faixas = f; S.config.sabadoUtil = !!d.get('sabado');
    salvar(); render(); toast('Ajustes salvos');
  }
});

document.addEventListener('keydown', (e) => {
  if (dlg.open || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
  if (e.key === 'ArrowLeft') mudarMes(-1);
  if (e.key === 'ArrowRight') mudarMes(1);
  if (e.key === 'n') { e.preventDefault(); formLancamento(); }
});

function ir(view) { ui.view = view; location.hash = view; render(); main.focus({ preventScroll: true }); window.scrollTo(0, 0); }
function mudarMes(delta) { ui.mes = ymDeNum(ymNum(ui.mes) + delta); render(); }

window.addEventListener('hashchange', () => {
  const v = location.hash.slice(1);
  if (VIEWS[v] && v !== ui.view) { ui.view = v; render(); }
});
let redim;
window.addEventListener('resize', () => { clearTimeout(redim); redim = setTimeout(() => { if (ui.view === 'painel') desenharGrafico(); }, 150); });
window.addEventListener('storage', (e) => { if (e.key === CHAVE) { S = carregar(); cache.clear(); render(); } });

/* ================= Backup ================= */

function exportar() {
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `orgfin-backup-${hojeISO()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Backup exportado');
}

function importar(arquivo) {
  const leitor = new FileReader();
  leitor.onload = () => {
    try {
      const d = JSON.parse(leitor.result);
      if (!d || !Array.isArray(d.recorrentes)) throw new Error('formato');
      if ((S.recorrentes.length || S.lancamentos.length) && !confirm('Importar vai substituir os dados atuais deste aparelho. Continuar?')) return;
      d.recorrentes.forEach((r) => (r.id = r.id || uid()));
      (d.lancamentos || []).forEach((l) => (l.id = l.id || uid()));
      (d.dividas || []).forEach((x) => (x.id = x.id || uid()));
      S = normalizar(d); salvar(); render(); toast('Dados importados');
    } catch (err) { toast('Arquivo inválido. Use um backup exportado pelo app.'); }
  };
  leitor.readAsText(arquivo);
}

function apagarTudo() {
  if (!confirm('Apagar todos os dados deste aparelho? Exporte um backup antes se quiser guardar.')) return;
  S = estadoVazio(); salvar(); render(); toast('Dados apagados');
}

/* ================= Instalação ================= */

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); eventoInstalar = e; if (ui.view === 'ajustes') render(); });
window.addEventListener('appinstalled', () => { eventoInstalar = null; toast('App instalado'); });
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

/* ================= Início ================= */

{
  const v = location.hash.slice(1);
  if (VIEWS[v]) ui.view = v;
  render();
}
