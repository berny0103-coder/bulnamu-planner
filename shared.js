/* ==========================================================================
   벌나무 릴레이 — 공유 데이터 레이어 / 유틸
   - 지금: localStorage 기반 (개발/데모용)
   - 나중: Supabase로 교체 (DataStore 객체만 갈아끼우면 됨)
   ========================================================================== */

// ── 캠페인 설정 ──
const CONFIG = {
  CAPACITY: 400,                                                   // 선착순 인원
  STORE_URL_DISCOUNT: 'https://smartstore.naver.com/rebootree/products/13088733330',  // 30% 할인 링크 (사장님이 별도 등록 예정)
  STORE_URL_NORMAL:   'https://smartstore.naver.com/rebootree',
  KAKAO_CHANNEL:      'https://pf.kakao.com/_unexfs',
  ADMIN_PASSWORD:     'bulnamu2026',                               // ⚠️ 운영 시 변경
  EVENT_NAME:         '숙취엔벌나무 릴레이',
};

// ── 추천 코드 생성 (6자리 영숫자, 헷갈리는 글자 제외) ──
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ── 데이터 저장소 (localStorage 구현) ──
const DataStore = {
  KEY: 'bulnamu_relay_v1',

  _load() {
    try {
      return JSON.parse(localStorage.getItem(this.KEY) || '{"applicants":[]}');
    } catch {
      return { applicants: [] };
    }
  },

  _save(data) {
    localStorage.setItem(this.KEY, JSON.stringify(data));
  },

  // 신청자 추가 (중복 휴대폰 방지)
  addApplicant({ name, phone, address, message, referredByCode }) {
    const data = this._load();

    // 중복 휴대폰 체크
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (data.applicants.some(a => a.phone.replace(/[^0-9]/g, '') === cleanPhone)) {
      return { ok: false, reason: 'duplicate' };
    }

    // 마감 체크
    if (data.applicants.length >= CONFIG.CAPACITY) {
      return { ok: false, reason: 'full' };
    }

    // 추천한 사람 찾기 (있으면)
    const referrer = referredByCode
      ? data.applicants.find(a => a.code === referredByCode)
      : null;

    // 새 신청자
    const newApplicant = {
      id: Date.now() + Math.random().toString(36).slice(2, 8),
      code: generateCode(),
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      message: (message || '').trim(),
      referredByCode: referrer ? referrer.code : null,
      referredByName: referrer ? referrer.name : null,
      createdAt: new Date().toISOString(),
      shipped: false,
    };

    // 코드 충돌 방지
    while (data.applicants.some(a => a.code === newApplicant.code)) {
      newApplicant.code = generateCode();
    }

    data.applicants.push(newApplicant);
    this._save(data);

    return { ok: true, applicant: newApplicant, position: data.applicants.length };
  },

  // 코드로 추천자 정보 조회 (랜딩에서 "○○님이 추천" 표시용)
  getReferrer(code) {
    if (!code) return null;
    const data = this._load();
    const referrer = data.applicants.find(a => a.code === code);
    return referrer ? { name: referrer.name, code: referrer.code } : null;
  },

  // 내 코드로 내가 추천한 사람 수 조회
  getReferralCount(code) {
    if (!code) return 0;
    const data = this._load();
    return data.applicants.filter(a => a.referredByCode === code).length;
  },

  // 전체 통계
  getStats() {
    const data = this._load();
    return {
      total: data.applicants.length,
      remaining: Math.max(0, CONFIG.CAPACITY - data.applicants.length),
      capacity: CONFIG.CAPACITY,
      isFull: data.applicants.length >= CONFIG.CAPACITY,
    };
  },

  // 관리자: 전체 리스트
  getAllApplicants() {
    return this._load().applicants;
  },

  // 관리자: 발송 체크
  markShipped(id, shipped = true) {
    const data = this._load();
    const a = data.applicants.find(x => x.id === id);
    if (a) {
      a.shipped = shipped;
      this._save(data);
    }
  },

  // 관리자: CSV 내보내기
  toCSV() {
    const data = this._load();
    const headers = ['순번', '신청일', '이름', '휴대폰', '주소', '내코드', '추천자', '추천자코드', '한마디', '발송완료'];
    const rows = data.applicants.map((a, i) => [
      i + 1,
      new Date(a.createdAt).toLocaleString('ko-KR'),
      a.name,
      a.phone,
      a.address,
      a.code,
      a.referredByName || '-',
      a.referredByCode || '-',
      a.message || '',
      a.shipped ? 'O' : '',
    ]);
    const escape = (v) => `"${String(v).replace(/"/g, '""')}"`;
    return [headers, ...rows].map(r => r.map(escape).join(',')).join('\r\n');
  },

  // 데모 시드 (개발용)
  seedDemo() {
    const data = this._load();
    if (data.applicants.length > 0) return;
    const seed = generateCode();
    data.applicants.push({
      id: 'seed-' + Date.now(),
      code: seed,
      name: '벌나무',
      phone: '01000000000',
      address: '본사',
      message: '첫 시작!',
      referredByCode: null,
      referredByName: null,
      createdAt: new Date().toISOString(),
      shipped: true,
    });
    this._save(data);
    return seed;
  },

  // ⚠️ 데모용: 전체 초기화
  _reset() {
    localStorage.removeItem(this.KEY);
  },
};

// ── 공유 유틸 ──
const Util = {
  // URL ?ref= 파라미터 추출
  getRefFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('ref') || params.get('c') || null;
  },

  // 추천 링크 생성
  buildReferralURL(code) {
    return `${window.location.origin}/r/${code}`;
  },

  // 휴대폰 포맷팅
  formatPhone(v) {
    const digits = v.replace(/[^0-9]/g, '').slice(0, 11);
    if (digits.length < 4) return digits;
    if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  },

  // 휴대폰 검증
  isValidPhone(v) {
    const digits = v.replace(/[^0-9]/g, '');
    return /^01[0-9]{8,9}$/.test(digits);
  },

  // 카카오톡 공유 (단순 링크 + 텍스트, SDK 없이)
  shareKakao(url, text) {
    // 모바일에선 카톡으로 직접 보내기 어려움 → 일단 클립보드 + 안내
    if (navigator.share) {
      navigator.share({ title: '숙취엔벌나무 릴레이', text, url }).catch(() => {});
    } else {
      this.copyToClipboard(`${text}\n${url}`);
      alert('링크가 복사됐어요. 카톡에 붙여넣으세요.');
    }
  },

  // 클립보드 복사
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    }
  },

  // 추천 메시지 (현실적인 톤)
  buildReferralMessage(url) {
    return `야 이거 그냥 광고 아니고
술 마신 다음날 살려주는 릴레이 같은건데

너 한 번 해봐
너 하면 나도 받을 수 있음

${url}`;
  },
};
