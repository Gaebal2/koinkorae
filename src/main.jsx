import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BarChart3,
  CalendarCheck,
  Check,
  ChevronDown,
  ChevronUp,
  CircleUserRound,
  Home,
  ImagePlus,
  Map,
  MapPin,
  MapPinPlus,
  MessageCircle,
  Repeat2,
  Search,
  Shield,
  SquarePen,
  Swords,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import cmcCoins from "./cmc-top100.json";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import { watchInstallPrompt } from "./install-prompt.js";

const asset = (name) => `${import.meta.env.BASE_URL}${name}`;
const DAY_MS = 24 * 60 * 60 * 1000;
const DUMMY_SCORE_LEADS = [0, 3000, -1600, 2200, -800, 1600, -2400, 1000, -3200, 2600];
const CONTROVERSIAL_DUMMY_COINS = [2, 5, 8];
const profileImage = (username) => {
  if (username === "battle_newbie") return asset("koin-korae-app-icon-blue-v2.png");
  const palettes = [["#075ea8","#64dde3"],["#6548a8","#b7a8ff"],["#c55765","#ffc1c8"],["#b46b16","#ffd28b"],["#176f78","#8ce7e1"]];
  const index=[...username].reduce((sum,char)=>sum+char.charCodeAt(0),0)%palettes.length;
  const [from,to]=palettes[index];
  const initials=username.split(/[_\s-]/).map(part=>part[0]).join("").slice(0,2).toUpperCase();
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="160" height="160" rx="80" fill="url(#g)"/><circle cx="80" cy="62" r="28" fill="#fff" fill-opacity=".18"/><text x="80" y="101" text-anchor="middle" font-family="Arial,sans-serif" font-size="48" font-weight="700" fill="white">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

const seedPosts = [
  {
    id: 1,
    author: "blockwhale",
    initials: "BW",
    coin: "BTC",
    age: "12분",
    content:
      "비트코인 오픈소스 개발자 후원 캠페인이 시작됐습니다. 커뮤니티의 힘을 보여주세요.",
    support: 1840,
    oppose: 210,
    comments: 84,
    reposts: 32,
    tone: "orange",
    image: asset("cinema-feed.png"),
    createdAt: Date.now() - 15 * 60 * 1000,
  },
  {
    id: 2,
    author: "sol_runner",
    initials: "SR",
    coin: "SOL",
    age: "38분",
    content:
      "서울 빌더 밋업 후기를 공유합니다. 작은 팀들이 만든 제품이 정말 인상적이었어요.",
    support: 932,
    oppose: 401,
    comments: 51,
    reposts: 18,
    tone: "purple",
    image: asset("koin-korae-app-icon-blue-v2.png"),
    createdAt: Date.now() - 2 * DAY_MS,
  },
  {
    id: 3,
    author: "ethernaut",
    initials: "ET",
    coin: "ETH",
    age: "1시간",
    content:
      "퍼블릭 굿즈는 누가 지켜야 할까요? 지속 가능한 생태계에 대한 제안입니다.",
    support: 1260,
    oppose: 1180,
    comments: 203,
    reposts: 67,
    tone: "blue",
    image: asset("koin-korae-app-icon.png"),
    createdAt: Date.now() - 45 * DAY_MS,
  },
  {
    id: 4,
    author: "battle_newbie",
    initials: "ME",
    coin: "XRP",
    age: "3시간",
    content:
      "국경 없는 결제가 지역 소상공인에게 가져올 변화에 대해 이야기해 봅시다.",
    support: 476,
    oppose: 96,
    comments: 29,
    reposts: 11,
    tone: "slate",
    image: asset("koin-korae-icon-source.png"),
    createdAt: Date.now() - 420 * DAY_MS,
  },
  ...cmcCoins.slice(0, 10).flatMap((coin, coinIndex) =>
    [
      "커뮤니티에서 주목하는 핵심 소식과 최근 생태계 변화를 함께 살펴봅니다.",
      "장기 보유자 관점에서 이번 주 흐름과 앞으로 확인할 지표를 정리했습니다.",
      "처음 접하는 사용자도 이해하기 쉽도록 주요 특징과 활용 사례를 공유합니다.",
      "개발과 커뮤니티 활동이 꾸준히 이어지는지 함께 의견을 나눠 보고 싶습니다.",
      "이 코인을 지지하는 이유와 반대 의견을 자유롭게 배틀로 남겨 주세요.",
    ].map((content, feedIndex) => ({
      id: 1000 + coinIndex * 10 + feedIndex,
      author: `${coin.symbol.toLowerCase()}_hodler_${feedIndex + 1}`,
      initials: coin.symbol.slice(0, 2),
      coin: coin.symbol,
      age: `${coinIndex + feedIndex + 1}시간`,
      content: `${coin.name}(${coin.symbol}) — ${content}${feedIndex === 0 && CONTROVERSIAL_DUMMY_COINS.includes(coinIndex) ? " 지지와 반대 의견이 팽팽하게 맞서고 있습니다." : ""}`,
      support:
        feedIndex === 0 && CONTROVERSIAL_DUMMY_COINS.includes(coinIndex)
          ? 10000 + [12, -3, 8][CONTROVERSIAL_DUMMY_COINS.indexOf(coinIndex)]
          : 7000 +
            (10 - coinIndex) * 350 +
            [
              DUMMY_SCORE_LEADS[coinIndex],
              -DUMMY_SCORE_LEADS[coinIndex],
              1200,
              -1200,
              0,
            ][feedIndex],
      oppose:
        feedIndex === 0 && CONTROVERSIAL_DUMMY_COINS.includes(coinIndex)
          ? 10000
          : 80 + coinIndex * 14 + feedIndex * 19,
      comments: 12 + coinIndex * 3 + feedIndex * 4,
      reposts: 4 + coinIndex + feedIndex * 2,
      tone: ["orange", "blue", "purple", "slate", "green"][feedIndex],
      image: feedIndex === 0 ? asset("cinema-feed.png") : "",
      createdAt:
        Date.now() - [0, 4, 24, 160, 540][feedIndex] * DAY_MS - coinIndex * 60 * 60 * 1000,
    })),
  ),
];
const seedPins = [
  {
    id: 1,
    title: "블록체인 스터디",
    description:
      "매주 목요일 저녁에 블록체인 스터디를 진행합니다. 블록체인을 처음 접하는 초보자도 환영합니다. 어려운 용어는 쉬운 예시를 사용해 함께 설명합니다. 매주 하나의 주제를 정해서 기초부터 차근차근 공부합니다. 궁금한 내용은 언제든 자유롭게 질문할 수 있습니다. 발표를 원하지 않아도 편하게 참여할 수 있습니다. 개인 노트북이 없어도 스터디 참여에는 문제가 없습니다. 간단한 음료와 간식을 준비해 두고 있습니다. 참여자들과 프로젝트 아이디어를 나누는 시간도 마련됩니다. 비트코인과 이더리움뿐 아니라 다양한 생태계를 함께 살펴봅니다. 스터디가 끝난 뒤에는 자유로운 네트워킹 시간이 이어집니다. 관심 있는 분은 링크를 통해 일정과 장소를 확인해 주세요.",
    coin: "ETH",
    tradeCoins: ["ETH", "USDT"],
    link: "https://ethereum.org",
    category: "서비스",
    lat: 37.5719,
    lng: 126.9769,
    owner: false,
    image: asset("cinema-feed.png"),
    creator: "ethernaut",
    creatorImage: profileImage("ethernaut"),
  },
  {
    id: 2,
    title: "크립토 북카페",
    description: "커피 결제 및 커뮤니티 모임",
    coin: "BTC",
    tradeCoins: ["BTC", "USDT"],
    link: "",
    category: "비즈니스",
    lat: 37.5663,
    lng: 126.9828,
    owner: false,
    image: asset("cinema-feed.png"),
    creator: "blockwhale",
    creatorImage: profileImage("blockwhale"),
  },
  {
    id: 3,
    title: "중고 노트북",
    description: "개발용 노트북 판매합니다",
    coin: "SOL",
    tradeCoins: ["SOL", "USDC"],
    link: "",
    category: "판매",
    lat: 37.5628,
    lng: 126.973,
    owner: false,
    image: asset("cinema-feed.png"),
    creator: "sol_runner",
    creatorImage: profileImage("sol_runner"),
  },
  ...[
    ["BTC 결제 카페", "BTC", ["BTC", "USDT"], 37.5752, 126.9901, "btc_hodler_1", "비즈니스"],
    ["이더리움 개발자 모임", "ETH", ["ETH", "USDC"], 37.5584, 126.9956, "eth_hodler_2", "커뮤니티"],
    ["솔라나 NFT 전시", "SOL", ["SOL", "USDC"], 37.5791, 126.9682, "sol_hodler_3", "이벤트"],
    ["XRP 해외송금 상담", "XRP", ["XRP", "USDT"], 37.5518, 126.9875, "xrp_hodler_1", "서비스"],
    ["BNB 트레이더 라운지", "BNB", ["BNB", "USDT"], 37.5651, 127.0034, "bnb_hodler_4", "커뮤니티"],
    ["USDT 가능 편집숍", "USDT", ["USDT", "USDC"], 37.5843, 126.9811, "usdt_hodler_2", "판매"],
    ["USDC 크리에이터 마켓", "USDC", ["USDC", "ETH"], 37.5467, 126.9763, "usdc_hodler_5", "마켓"],
    ["TRON 밋업 스팟", "TRX", ["TRX", "USDT"], 37.5712, 127.0112, "trx_hodler_1", "이벤트"],
    ["HYPE 커뮤니티 데스크", "HYPE", ["HYPE", "USDC"], 37.5607, 126.9615, "hype_hodler_3", "커뮤니티"],
    ["DOGE 굿즈 플리마켓", "DOGE", ["DOGE", "USDT"], 37.5874, 126.9992, "doge_hodler_2", "판매"],
  ].map(([title, coin, tradeCoins, lat, lng, creator, category], index) => ({
    id: 10 + index,
    title,
    description: `${coin} 커뮤니티 사용자를 위한 테스트 PIN입니다. 거래와 모임 정보를 확인해 보세요.`,
    coin,
    tradeCoins,
    link: "",
    category,
    lat,
    lng,
    owner: false,
    image: index % 3 === 0 ? asset("cinema-feed.png") : "",
    creator,
    creatorImage: profileImage(creator),
  })),
];
const windows = ["오늘", "이번 달", "올해", "전체"];
const categories = ["노출", "최신", "팔로잉", "급상승", "논쟁"];
const nav = [
  ["home", "홈", Home],
  ["map", "지도", Map],
  ["check", "체크인", CalendarCheck],
  ["profile", "프로필", CircleUserRound],
];
const fmt = (n) =>
  new Intl.NumberFormat("ko-KR", {
    notation: Math.abs(n) > 999 ? "compact" : "standard",
  }).format(n);
const exposure = (p) => p.support - p.oppose;
const isFollowingPost = (post) =>
  ["blockwhale", "sol_runner", "ethernaut"].includes(post.author) ||
  post.author.endsWith("_hodler_1");
const risingScore = (post) => {
  const hours = Math.max(1, (Date.now() - (post.createdAt || 0)) / (60 * 60 * 1000));
  return exposure(post) / hours;
};
const comparePosts = (category) => (a, b) =>
  category === "논쟁"
    ? b.support + b.oppose - (a.support + a.oppose)
    : category === "최신"
      ? (b.createdAt || 0) - (a.createdAt || 0)
      : category === "급상승"
        ? risingScore(b) - risingScore(a)
        : exposure(b) - exposure(a);
const groupMetric = (items, category) =>
  category === "논쟁"
    ? items.reduce((sum, post) => sum + post.support + post.oppose, 0)
    : category === "최신"
      ? Math.max(...items.map((post) => post.createdAt || 0))
      : category === "급상승"
        ? items.reduce((sum, post) => sum + risingScore(post), 0)
        : items.reduce((sum, post) => sum + exposure(post), 0);
const buildCoinRanks = (posts) => {
  const totals = posts.reduce((scores, post) => {
    scores[post.coin] = (scores[post.coin] || 0) + exposure(post);
    return scores;
  }, {});
  return new globalThis.Map(
    Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .map(([coin], index) => [coin, index + 1]),
  );
};
const coinColor = (s) =>
  ({
    BTC: "#f59e0b",
    ETH: "#627eea",
    SOL: "#14b8a6",
    XRP: "#334155",
    ADA: "#2875d2",
  })[s] || "#266b4f";

function Coin({ symbol, size = "md" }) {
  return (
    <span
      className={`coin coin-${size}`}
      style={{ "--coin": coinColor(symbol) }}
    >
      <span className="coin-fallback">{symbol.slice(0, 4)}</span>
      <img src={asset(`coin-icons/${symbol.toLowerCase()}.svg`)} alt={`${symbol} 아이콘`} onError={event=>{event.currentTarget.style.display="none"}} />
    </span>
  );
}
function Header({ bp, onProfile }) {
  return (
    <header className="topbar">
      <div className="logo">
        <button className="header-profile" onClick={onProfile} aria-label="내 프로필로 이동"><img src={asset("koin-korae-app-icon-blue-v2.png")} alt="내 프로필" /></button>
        <div>ㅋㅇㄱㄹ<small>POWERED BY COIN HODLER</small></div>
      </div>
      <div className="bp-pill">
        <Zap /> <b>{bp}</b> BP
      </div>
    </header>
  );
}
function Segments({ items, value, onChange, compact = false }) {
  return (
    <div className={`segments ${compact ? "compact" : ""}`}>
      {items.map((item) => (
        <button
          key={item}
          className={value === item ? "active" : ""}
          onClick={() => onChange(item)}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

function PostCard({ post, onBattle, onComment, onRepost, onProfile, rank }) {
  const total = post.support + post.oppose || 1;
  return (
    <article className="post-card">
      <div className="post-head">
        <button className={`avatar tone-${post.tone}`} onClick={()=>onProfile?.(post.author)} aria-label={`${post.author} 프로필 보기`}>{post.initials}</button>
        <div>
          <b>@{post.author}</b>
          <span>{post.age}</span>
        </div>
        {rank && <span className="rank">#{rank}</span>}
        <Coin symbol={post.coin} />
      </div>
      <p className="post-body">{post.content}</p>
      {post.image&&<button className="post-image" type="button" onClick={()=>window.open(post.image,"_blank")} aria-label="피드 이미지 크게 보기"><img src={post.image} alt="피드 첨부 이미지"/></button>}
      <div className="battle-meter">
        <i style={{ width: `${(post.support / total) * 100}%` }} />
        <span>지지 {fmt(post.support)}</span>
        <span>반대 {fmt(post.oppose)}</span>
      </div>
      <div className="score-row">
        <div>
          <small>노출 점수</small>
          <strong className={exposure(post) < 0 ? "negative" : ""}>
            {exposure(post) > 0 ? "+" : ""}
            {fmt(exposure(post))}
          </strong>
        </div>
        <div className="card-actions">
          <button onClick={() => onComment(post)}>
            <MessageCircle />
            {post.comments}
          </button>
          <button onClick={() => onRepost(post)}>
            <Repeat2 />
            {post.reposts}
          </button>
          <button className="battle-btn" onClick={() => onBattle(post)}>
            <Swords />
            배틀
          </button>
        </div>
      </div>
    </article>
  );
}

function HomePage({ posts, setPosts, bp, setBp, onCompose, onProfile }) {
  const [feed, setFeed] = useState("유저 피드");
  const [period, setPeriod] = useState("오늘");
  const [category, setCategory] = useState("노출");
  const [battle, setBattle] = useState(null);
  const [commentPost, setCommentPost] = useState(null);
  const [comment, setComment] = useState("");
  const filteredPosts = useMemo(() => {
    const now = new Date();
    const cutoff =
      period === "오늘"
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
        : period === "이번 달"
          ? new Date(now.getFullYear(), now.getMonth(), 1).getTime()
          : period === "올해"
            ? new Date(now.getFullYear(), 0, 1).getTime()
            : 0;
    return posts.filter((post) => (post.createdAt || 0) >= cutoff);
  }, [posts, period]);
  const sorted = useMemo(
    () =>
      (category === "팔로잉"
        ? filteredPosts.filter(isFollowingPost)
        : [...filteredPosts]
      ).sort(comparePosts(category)),
    [filteredPosts, category],
  );
  const groups = useMemo(
    () =>
      Object.entries(
        sorted.reduce((a, p) => {
          (a[p.coin] ??= []).push(p);
          return a;
        }, {}),
      ).sort((a, b) => groupMetric(b[1], category) - groupMetric(a[1], category)),
    [sorted, category],
  );
  const coinRanks = useMemo(
    () => buildCoinRanks(filteredPosts),
    [filteredPosts],
  );
  const updateScore = (id, type, score) =>
    setPosts((ps) =>
      ps.map((p) => (p.id === id ? { ...p, [type]: p[type] + score } : p)),
    );
  const repost = (p) =>
    setPosts((ps) =>
      ps.map((x) => (x.id === p.id ? { ...x, reposts: x.reposts + 1 } : x)),
    );
  return (
    <>
      <main className="home-page">
        <div className="feed-controls">
          <div className="feed-toggle">
            <Segments
              items={["유저 피드", "코인 피드"]}
              value={feed}
              onChange={setFeed}
            />
          </div>
          <div className="filters">
            <Segments
              items={categories}
              value={category}
              onChange={setCategory}
              compact
            />
            <span className="filter-divider" />
            <Segments
              items={windows}
              value={period}
              onChange={setPeriod}
              compact
            />
          </div>
        </div>
        {feed === "유저 피드" ? (
          <div className="feed">
            {sorted.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                rank={coinRanks.get(p.coin)}
                onBattle={setBattle}
                onComment={setCommentPost}
                onRepost={repost}
                onProfile={onProfile}
              />
            ))}
          </div>
        ) : (
          <CoinFeed
            groups={groups}
            coinRanks={coinRanks}
            category={category}
            onBattle={setBattle}
            onComment={setCommentPost}
            onRepost={repost}
            onProfile={onProfile}
          />
        )}
        <button className="fab" onClick={onCompose} aria-label="새 피드 작성" title="새 피드 작성">
          <SquarePen aria-hidden="true" />
        </button>
      </main>
      {battle && (
        <BattleModal
          post={battle}
          bp={bp}
          onClose={() => setBattle(null)}
          onFinish={(type, score) => {
            setBp((v) => v - 1);
            updateScore(battle.id, type, score);
            setBattle(null);
          }}
        />
      )}
      {commentPost && (
        <Modal title="댓글 쓰기" onClose={() => setCommentPost(null)}>
          <p className="quoted">
            @{commentPost.author} · {commentPost.content}
          </p>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="의견을 남겨주세요"
          />
          <button
            className="primary"
            disabled={!comment.trim()}
            onClick={() => {
              setPosts((ps) =>
                ps.map((p) =>
                  p.id === commentPost.id
                    ? { ...p, comments: p.comments + 1 }
                    : p,
                ),
              );
              setCommentPost(null);
              setComment("");
            }}
          >
            댓글 게시
          </button>
        </Modal>
      )}
    </>
  );
}
function CoinFeed({ groups, coinRanks, category, ...actions }) {
  const [open, setOpen] = useState({});
  return (
    <div>
      {groups.map(([coin, items]) => {
        const score = groupMetric(items, category);
        const label = category === "논쟁" ? "논쟁 참여" : category === "급상승" ? "급상승" : "코인 노출";
        return (
          <section className="coin-group" key={coin}>
            <button
              className="coin-group-head"
              onClick={() => setOpen((current) => ({ ...current, [coin]: !current[coin] }))}
            >
              <Coin symbol={coin} />
              <div>
                <b>
                  #{coinRanks.get(coin)} {coin}
                </b>
                <small>
                  {category === "최신" ? `최근 피드 ${items[0].age}` : `${label} ${score > 0 ? "+" : ""}${fmt(Math.round(score))}`}
                </small>
              </div>
              {open[coin] ? <ChevronUp /> : <ChevronDown />}
            </button>
            {open[coin] &&
              items.map((p) => (
                <PostCard key={p.id} post={p} rank={coinRanks.get(coin)} {...actions} />
              ))}
          </section>
        );
      })}
    </div>
  );
}
function PinDetailCard({ pin, onProfile, onImage, onDelete, className = "" }) {
  return (
    <div className={`pin-detail ${className}`}>
      {pin.image && (
        <button className="pin-detail-photo-button" onClick={() => onImage?.(pin)} aria-label="사진 전체 화면으로 보기">
          <img className="pin-detail-photo" src={pin.image} alt="핀 등록 사진" />
        </button>
      )}
      <div className="pin-detail-content">
        <div className="pin-creator">
          <Coin symbol={pin.coin} size="sm" />
          <button type="button" className="pin-creator-profile" onClick={() => onProfile?.(pin.creator || "battle_newbie")} aria-label="핀 생성자 프로필 보기">
            <img src={profileImage(pin.creator || "battle_newbie")} alt={`${pin.creator || "battle_newbie"} 프로필`} />
          </button>
          <span>@{pin.creator || "battle_newbie"}</span>
        </div>
        <small>거래 가능한 코인: {pin.tradeCoins?.join(", ")}</small>
        <b>{pin.title}</b>
        <p>{pin.description}</p>
        {pin.link && <a href={pin.link} target="_blank" rel="noreferrer">{pin.link}</a>}
      </div>
      {onDelete && <button className="pin-delete" aria-label="핀 삭제" title="핀 삭제" onClick={() => onDelete(pin)}>삭제</button>}
    </div>
  );
}
function BattleModal({ post, bp, onClose, onFinish }) {
  const [side, setSide] = useState(null),
    [phase, setPhase] = useState("choose"),
    [score, setScore] = useState(0),
    [time, setTime] = useState(5);
  const start = (s) => {
    if (bp < 1) return;
    setSide(s);
    setPhase("game");
    setScore(0);
    setTime(5);
  };
  const tap = () => {
    if (phase !== "game" || time <= 0) return;
    setScore((v) => v + Math.floor(Math.random() * 6) + 5);
    setTime((v) => {
      const next = Math.max(0, v - 1);
      if (next === 0) setPhase("result");
      return next;
    });
  };
  return (
    <Modal title="배틀 참여" onClose={onClose}>
      {phase === "choose" ? (
        <>
          <p className="center battle-question">이 피드를 지지합니까? 반대 합니까?</p>
          <div className="battle-explain">
            <span><Shield />지지하면 이 Feed의 노출 점수가 증가합니다.</span>
            <span><Swords />반대하면 이 Feed의 노출 점수가 감소합니다.</span>
          </div>
          <div className="side-choice">
            <button disabled={bp < 1} onClick={() => start("support")}>
              <Shield />
              지지
            </button>
            <button disabled={bp < 1} onClick={() => start("oppose")}>
              <Swords />
              반대
            </button>
          </div>
          {bp < 1 && (
            <p className="error">BP가 부족합니다. 체크인으로 BP를 받으세요.</p>
          )}
        </>
      ) : (
        <div className="minigame">
          <span className="game-label">랜덤 게임 · 스피드 탭</span>
          <div className="game-stats">
            <b>{score}</b>
            <span>남은 탭 {time}</span>
          </div>
          {phase === "game" ? (
            <button className="tap-target" onClick={tap}>
              TAP!
            </button>
          ) : (
            <>
              <Trophy />
              <h2>{score}점 획득!</h2>
              <p>{side === "support" ? "지지" : "반대"} 점수에 반영됩니다.</p>
              <button className="primary" onClick={() => onFinish(side, score)}>
                결과 반영
              </button>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

function MapPage({ pins, setPins, lifetime, bp, setBp, onProfile }) {
  const mapEl = useRef(null),
    mapRef = useRef(null),
    layerRef = useRef(null);
  const [editing, setEditing] = useState(false),
    [selected, setSelected] = useState(null),
    [imageOpen, setImageOpen] = useState(false),
    [center, setCenter] = useState({ lat: 37.5665, lng: 126.978 });
  const limit = lifetime >= 10000 ? 3 : lifetime >= 1000 ? 2 : 1;
  const mine = pins.filter((p) => p.owner).length;
  useEffect(() => {
    if (!editing) return;
    history.pushState({ battleFeedOverlay: "pin-form" }, "");
    const onBack = () => setEditing(false);
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, [editing]);
  const closePinForm = () => {
    if (history.state?.battleFeedOverlay === "pin-form") history.back();
    else setEditing(false);
  };
  useEffect(() => {
    if (mapRef.current) return;
    const map = L.map(mapEl.current, { zoomControl: false }).setView(
      [center.lat, center.lng],
      14,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    map.on("moveend", () => {
      const c = map.getCenter();
      setCenter({ lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6) });
    });
    map.on("click", () => setSelected(null));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);
  useEffect(() => {
    if (!mapRef.current) return;
    layerRef.current?.remove();
    const layer = L.layerGroup().addTo(mapRef.current);
    pins.forEach((p) => {
      const icon = L.divIcon({
        className: "battle-map-marker",
        html: `<span style="--pin:${coinColor(p.coin)}"><img src="${asset(`coin-icons/${p.coin.toLowerCase()}.svg`)}" alt="${p.coin}" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><b>${p.coin.slice(0,4)}</b></span>`,
        iconSize: [40, 48],
        iconAnchor: [20, 45],
      });
      L.marker([p.lat, p.lng], { icon })
        .addTo(layer)
        .on("click", (event) => {
          L.DomEvent.stopPropagation(event.originalEvent);
          setSelected(p);
        });
    });
    layerRef.current = layer;
  }, [pins]);
  return (
    <main className="map-page">
      <div className="map-stage">
        <div className="real-map" ref={mapEl} />
        <div className="map-crosshair" aria-label="핀 생성 위치" />
        <div className="center-coordinate">
          {center.lat.toFixed(6)}, {center.lng.toFixed(6)}
        </div>
      </div>
      <div className="map-toolbar">
        <span>
          내 핀 {mine}/{limit} · 보유 {bp} BP
        </span>
        <button
          disabled={mine >= limit || bp < 1}
          onClick={() => setEditing(true)}
          aria-label="지도 위에 핀 추가"
          title="지도 위에 핀 추가"
        >
          <MapPinPlus aria-hidden="true" />
        </button>
      </div>
      {selected && (
        <PinDetailCard pin={selected} onProfile={onProfile} onImage={() => setImageOpen(true)} onDelete={selected.owner ? (pin) => { setPins((ps) => ps.filter((p) => p.id !== pin.id)); setSelected(null); } : null} />
      )}
      {editing && (
        <PinForm
          center={center}
          onClose={closePinForm}
          onSave={(p) => {
            setPins((ps) => [
              ...ps,
              { ...p, id: Date.now(), owner: true, category: "커뮤니티", creator: "battle_newbie", creatorImage: asset("koin-korae-app-icon-blue-v2.png") },
            ]);
            setBp((v) => v - 1);
            closePinForm();
          }}
        />
      )}
      {imageOpen && selected?.image && (
        <div className="image-lightbox" role="dialog" aria-modal="true" onClick={() => setImageOpen(false)}>
          <button aria-label="전체 화면 이미지 닫기" onClick={() => setImageOpen(false)}><X /></button>
          <img src={selected.image} alt="핀 등록 사진 전체 화면" onClick={(event) => event.stopPropagation()} />
        </div>
      )}
    </main>
  );
}
function PinForm({ center, onClose, onSave }) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    coin: "BTC",
    tradeCoins: [],
    link: "",
    lat: center.lat,
    lng: center.lng,
    image: "",
  });
  const fileRef = useRef(null);
  const coins = cmcCoins.slice(0, 30);
  const toggle = (s) =>
    setForm((f) => ({
      ...f,
      tradeCoins: f.tradeCoins.includes(s)
        ? f.tradeCoins.filter((x) => x !== s)
        : [...f.tradeCoins, s],
    }));
  const valid =
    form.title.trim() &&
    form.description.trim() &&
    form.coin &&
    form.tradeCoins.length > 0 &&
    Number.isFinite(+form.lat) &&
    Number.isFinite(+form.lng);
  const chooseImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((current) => ({ ...current, image: reader.result }));
    reader.readAsDataURL(file);
  };
  return (
    <Modal title="지도위에 핀 추가" onClose={onClose} className="pin-form-modal">
      <div className="pin-location">
        <MapPin />
        <div>
          <b>지도 중앙의 + 위치</b>
          <span>
            위도 {form.lat} · 경도 {form.lng}
          </span>
        </div>
      </div>
      <div className="coordinate-fields">
        <Field label="위도">
          <input
            type="number"
            step="any"
            value={form.lat}
            onChange={(e) => setForm({ ...form, lat: e.target.value })}
          />
        </Field>
        <Field label="경도">
          <input
            type="number"
            step="any"
            value={form.lng}
            onChange={(e) => setForm({ ...form, lng: e.target.value })}
          />
        </Field>
      </div>
      <Field label="지지하는 코인 (핀 이미지)">
        <select
          value={form.coin}
          onChange={(e) => setForm({ ...form, coin: e.target.value })}
        >
          {coins.map((c) => (
            <option key={c.id}>{c.symbol}</option>
          ))}
        </select>
      </Field>
      <Field label="거래 가능한 코인 (복수 선택)">
        <div className="trade-coins">
          {coins.map((c) => (
            <button
              type="button"
              key={c.id}
              className={form.tradeCoins.includes(c.symbol) ? "selected" : ""}
              onClick={() => toggle(c.symbol)}
            >
              <Coin symbol={c.symbol} size="sm" />
              {c.symbol}
              {form.tradeCoins.includes(c.symbol) && <Check />}
            </button>
          ))}
        </div>
      </Field>
      <Field label="제목">
        <input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="핀 제목을 입력하세요"
        />
      </Field>
      <Field label="설명">
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="상품, 서비스 또는 장소를 설명하세요"
        />
      </Field>
      <Field label="링크 (선택)">
        <input
          type="url"
          value={form.link}
          onChange={(e) => setForm({ ...form, link: e.target.value })}
          placeholder="https:// 홈페이지 또는 소셜 링크"
        />
      </Field>
      <Field label="사진 (선택 · 1장)">
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={chooseImage} />
        {form.image ? (
          <div className="pin-photo-preview">
            <img src={form.image} alt="업로드 사진 미리보기" />
            <button type="button" onClick={() => setForm({ ...form, image: "" })}><X /></button>
          </div>
        ) : (
          <button type="button" className="pin-photo-picker" onClick={() => fileRef.current?.click()}><ImagePlus />사진 선택</button>
        )}
      </Field>
      <button
        className="primary"
        disabled={!valid}
        onClick={() => onSave({ ...form, lat: +form.lat, lng: +form.lng })}
      >
        이 위치에 핀 등록 · 1 BP
      </button>
      <button className="secondary" onClick={onClose}>
        취소
      </button>
    </Modal>
  );
}
function CheckinPage({ bp, setBp, lifetime, setLifetime }) {
  const [checked, setChecked] = useState(false),
    [adCount, setAdCount] = useState(0);
  const reward = (n) => {
    setBp((v) => v + n);
    setLifetime((v) => v + n);
  };
  return (
    <main>
      <PageTitle
        icon={CalendarCheck}
        title="오늘의 BP"
        sub="참여에 필요한 Battle Point를 모으세요"
      />
      <section className="balance-card">
        <span>사용 가능한 BP</span>
        <strong>{bp}</strong>
        <small>Lifetime Earned · {lifetime.toLocaleString()} BP</small>
      </section>
      <section className="check-card">
        <div className="calendar-mark">
          <CalendarCheck />
        </div>
        <h2>{checked ? "오늘 출석 완료!" : "매일 출석하고 +10 BP"}</h2>
        <p>
          {checked
            ? "내일 다시 만나요."
            : "연속 참여로 커뮤니티 영향력을 키워보세요."}
        </p>
        <button
          className="primary"
          disabled={checked}
          onClick={() => {
            setChecked(true);
            reward(10);
          }}
        >
          {checked ? (
            <>
              <Check />
              지급 완료
            </>
          ) : (
            <>
              <Zap />
              출석 체크
            </>
          )}
        </button>
      </section>
      <section className="reward-row">
        <div>
          <span>REWARDED AD</span>
          <b>짧은 광고 보고 +20 BP</b>
          <small>오늘 {adCount}/3회 참여</small>
        </div>
        <button
          disabled={adCount >= 3}
          onClick={() => {
            setAdCount((v) => v + 1);
            reward(20);
          }}
        >
          받기
        </button>
      </section>
      <div className="notice-box">
        <Shield />
        <p>
          <b>BP는 플랫폼 참여 자원입니다.</b>
          <br />
          현금이나 암호화폐가 아니며 전송·교환할 수 없습니다.
        </p>
      </div>
    </main>
  );
}
function ProfilePage({ posts, setPosts, pins, setPins, bp, setBp, lifetime, username, coinRanks }) {
  const [view, setView] = useState("프로필");
  const [battle,setBattle]=useState(null);
  const isMe=username==="battle_newbie";
  const tier =
    lifetime >= 10000 ? "Gold" : lifetime >= 1000 ? "Silver" : "Bronze";
  const people={팔로워:['coinlover','eth_builder','mapmaker'],팔로잉:['blockwhale','sol_runner'],친구:['ethernaut','xrpulse']};
  useEffect(()=>{if(view==="프로필")return;history.pushState({battleFeedOverlay:"profile-subpage"},"");const onBack=()=>setView("프로필");window.addEventListener("popstate",onBack);return()=>window.removeEventListener("popstate",onBack)},[view]);
  const closeSubpage=()=>{if(history.state?.battleFeedOverlay==="profile-subpage")history.back();else setView("프로필")};
  if(view!=="프로필") return <main className="profile-subpage"><button className="profile-back" onClick={closeSubpage}>← 내 프로필</button><h1>{view}</h1>{people[view]?<div className="people-list">{people[view].map((name,i)=><div key={name}><img src={profileImage(name)} alt={`${name} 프로필`}/><span><b>@{name}</b><small>{i%2?'함께 성장하는 커뮤니티 멤버':'코인과 기술 이야기를 나눕니다'}</small></span><button>{view==='친구'?'친구':'팔로우'}</button></div>)}</div>:view==='PIN'?<div className="profile-pin-list">{pins.filter(p=>p.owner).length?pins.filter(p=>p.owner).map(p=><PinDetailCard key={p.id} pin={p} className="profile-pin-card" onImage={(pin)=>window.open(pin.image,"_blank")} onDelete={(pin)=>setPins(all=>all.filter(item=>item.id!==pin.id))}/>):<Empty text="생성한 PIN이 없습니다"/>}</div>:<div className="profile-comments"><div><b>블록체인 스터디</b><p>초보자도 함께할 수 있어서 기대됩니다!</p></div><div><b>퍼블릭 굿즈에 대한 제안</b><p>지속 가능한 참여 방식에 공감합니다.</p></div></div>}</main>;
  return (
    <main className="profile-page-x">
      <section className="profile-head">
        <img className="profile-avatar" src={profileImage(username)} alt={`${username} 프로필`} />
        <h1>@{username}</h1>
        <p>투명한 피드와 열린 커뮤니티를 응원합니다.</p>
        <div className="profile-social"><button onClick={()=>setView('팔로워')}><b>128</b> 팔로워</button><button onClick={()=>setView('팔로잉')}><b>64</b> 팔로잉</button></div>
      </section>
      <section className="tier-card">
        <Trophy />
        <div>
          <small>현재 등급</small>
          <b>{tier}</b>
          <span>
            핀 슬롯 {tier === "Gold" ? 3 : tier === "Silver" ? 2 : 1}개 사용
            가능
          </span>
        </div>
        <i style={{ width: `${Math.min(100, lifetime / 10)}%` }} />
      </section>
      {isMe&&<div className="profile-links"><button onClick={()=>setView('친구')}>친구목록</button><button onClick={()=>setView('PIN')}>PIN</button><button onClick={()=>setView('댓글')}>댓글</button></div>}
      <h2 className="profile-feed-title">내 Feed</h2>
      <div className="feed">{posts.length?posts.map((p)=><PostCard key={p.id} post={p} rank={coinRanks.get(p.coin)} onBattle={setBattle} onComment={()=>{}} onRepost={()=>{}}/>):<Empty text="아직 작성한 Feed가 없습니다"/>}</div>
      {battle&&<BattleModal post={battle} bp={bp} onClose={()=>setBattle(null)} onFinish={(type,score)=>{setBp(v=>v-1);setPosts(all=>all.map(p=>p.id===battle.id?{...p,[type]:p[type]+score}:p));setBattle(null)}}/>}
    </main>
  );
}
function Empty({text}){return <div className="empty-state"><BarChart3/><h3>{text}</h3></div>}
function InstallPrompt(){
  const [installEvent,setInstallEvent]=useState(null);
  const [installing,setInstalling]=useState(false);
  const controller=useRef(null);
  useEffect(()=>{
    controller.current=watchInstallPrompt(window,setInstallEvent);
    return()=>controller.current.dispose();
  },[]);
  const dismiss=()=>controller.current?.dismiss();
  const install=async()=>{
    if(!installEvent||installing)return;
    setInstalling(true);
    try { await installEvent.prompt(); await installEvent.userChoice; dismiss(); }
    catch { setInstallEvent(null); }
    finally { setInstalling(false); }
  };
  if(!installEvent)return null;
  return <div className="install-overlay" role="dialog" aria-modal="true" aria-labelledby="install-heading"><section className="install-card"><button className="install-dismiss" onClick={dismiss} aria-label="설치 안내 닫기"><X/></button><img src={asset("koin-korae-app-icon-blue-v2.png")} alt="ㅋㅇㄱㄹ 앱 아이콘"/><small>ㅋㅇㄱㄹ APP</small><h2 id="install-heading">앱으로 설치할까요?</h2><p>홈 화면에서 더 빠르고 편하게 이용할 수 있어요.</p><button className="install-action" onClick={install} disabled={installing}>{installing?"설치 확인 중…":"앱 설치하기"}</button><button className="install-later" onClick={dismiss}>나중에</button></section></div>
}
function Composer({ onClose, onPublish }) {
  const [content, setContent] = useState(""),
    [coin, setCoin] = useState("BTC"),
    [query, setQuery] = useState(""),
    [image,setImage]=useState("");
  const fileRef=useRef(null);
  const chooseImage=event=>{const file=event.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>setImage(reader.result);reader.readAsDataURL(file)};
  const list = cmcCoins
    .filter((c) =>
      `${c.name} ${c.symbol}`.toLowerCase().includes(query.toLowerCase()),
    )
    .slice(0, 12);
  return (
    <Modal title="새 피드 작성" onClose={onClose} className="composer-modal">
      <textarea
        className="composer-text"
        autoFocus
        value={content}
        maxLength={500}
        onChange={(e) => setContent(e.target.value)}
        placeholder="커뮤니티에 어떤 이야기를 전할까요?"
      />
      <span className="counter">{content.length}/500</span>
      <div className="feed-image-field">
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={chooseImage}/>
        {image?<div className="feed-image-preview"><img src={image} alt="피드 이미지 미리보기"/><button type="button" onClick={()=>setImage("")} aria-label="이미지 제거"><X/></button></div>:<button type="button" className="feed-image-picker" onClick={()=>fileRef.current?.click()}><ImagePlus/>이미지 추가</button>}
      </div>
      <label className="search">
        <Search />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="지원 코인 검색"
        />
      </label>
      <div className="coin-list">
        {list.map((c) => (
          <button
            className={coin === c.symbol ? "selected" : ""}
            key={c.id}
            onClick={() => setCoin(c.symbol)}
          >
            <Coin symbol={c.symbol} />
            <span>
              <b>{c.name}</b>
              <small>
                {c.symbol} · #{c.cmcRank}
              </small>
            </span>
            {coin === c.symbol && <Check />}
          </button>
        ))}
      </div>
      <button
        className="primary"
        disabled={!content.trim()}
        onClick={() =>
          onPublish({
            id: Date.now(),
            author: "battle_newbie",
            initials: "ME",
            coin,
            age: "방금",
            content: content.trim(),
            support: 0,
            oppose: 0,
            comments: 0,
            reposts: 0,
            tone: "green",
            image,
            isFresh: true,
            createdAt: Date.now(),
          })
        }
      >
        게시하기
      </button>
    </Modal>
  );
}
function Modal({ title, onClose, children, className = "" }) {
  return (
    <div className="overlay">
      <section className={`modal ${className}`}>
        <header>
          <b>{title}</b>
          <button onClick={onClose} aria-label="닫기">
            <X />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}
function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function PageTitle({ icon: Icon, title, sub }) {
  return (
    <div className="page-title">
      <span>
        <Icon />
      </span>
      <div>
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
    </div>
  );
}
function App() {
  const [page, setPage] = useState("home"),
    [posts, setPosts] = useState(seedPosts),
    [pins, setPins] = useState(seedPins),
    [bp, setBp] = useState(24),
    [lifetime, setLifetime] = useState(680),
    [compose, setCompose] = useState(false),
    [profileUser,setProfileUser]=useState("battle_newbie");
  const coinRanks = useMemo(() => buildCoinRanks(posts), [posts]);
  const openProfile=(username="battle_newbie")=>{setProfileUser(username);setPage("profile")};
  useEffect(() => {
    if (!compose) return;
    history.pushState({ battleFeedOverlay: "composer" }, "");
    const onBack = () => setCompose(false);
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, [compose]);
  const closeComposer = () => {
    if (history.state?.battleFeedOverlay === "composer") history.back();
    else setCompose(false);
  };
  return (
    <div className={`app-shell ${page === "map" ? "map-active" : ""}`}>
      <Header bp={bp} onProfile={()=>openProfile("battle_newbie")} />
      {page === "home" && (
        <HomePage
          posts={posts}
          setPosts={setPosts}
          bp={bp}
          setBp={setBp}
          onCompose={() => setCompose(true)}
          onProfile={openProfile}
        />
      )}{" "}
      {page === "map" && (
        <MapPage
          pins={pins}
          setPins={setPins}
          setPins={setPins}
          lifetime={lifetime}
          bp={bp}
          setBp={setBp}
          onProfile={openProfile}
        />
      )}{" "}
      {page === "check" && (
        <CheckinPage
          bp={bp}
          setBp={setBp}
          lifetime={lifetime}
          setLifetime={setLifetime}
        />
      )}{" "}
      {page === "profile" && (
        <ProfilePage
          posts={posts.filter((p) => p.author === profileUser)}
          setPosts={setPosts}
          pins={pins}
          bp={bp}
          setBp={setBp}
          lifetime={lifetime}
          username={profileUser}
          coinRanks={coinRanks}
        />
      )}
      <nav className="bottom-nav">
        {nav.map(([id, label, Icon]) => (
          <button
            key={id}
            className={page === id ? "active" : ""}
            onClick={() => id==="profile"?openProfile("battle_newbie"):setPage(id)}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {compose && (
        <Composer
          onClose={closeComposer}
          onPublish={(p) => {
            setPosts((ps) => [p, ...ps]);
            closeComposer();
            setPage("home");
          }}
        />
      )}
      <InstallPrompt />
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
if ("serviceWorker" in navigator)
  window.addEventListener("load", () =>
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`),
  );
