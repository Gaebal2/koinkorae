import { t } from './language.js';
import React from 'react';
import { Modal } from './ui.jsx';

export function PointsPolicy({ onClose }) {
  return <Modal title={t("포인트 및 등급 정책")} onClose={onClose}>
    <section className="points-policy"><h2>{t("포인트 (BP)")}</h2>
      <p>{t("BP는 커뮤니티 참여 포인트입니다. 매일 출석하면 10 BP를 받으며, 한국 시간 자정에 새로운 출석이 시작됩니다.")}</p>
      <p>{t("보유 BP는 현재 사용할 수 있는 포인트이고, 누적 BP는 지금까지 획득한 포인트입니다. 등급은 누적 BP를 기준으로 결정됩니다.")}</p>
      <h2>{t("등급 기준")}</h2><table><thead><tr><th>{t("등급")}</th><th>{t("누적 BP")}</th></tr></thead><tbody>
        <tr><td>Bronze</td><td>0 ~ 999 BP</td></tr><tr><td>Silver</td><td>1,000 ~ 9,999 BP</td></tr><tr><td>Gold</td><td>{t("10,000 BP 이상")}</td></tr>
      </tbody></table>
      <h2>{t("이용 정책")}</h2><p>{t("배틀은 무료로 참여할 수 있습니다. PIN은 등급에 관계없이 계정당 최대 3개까지 무료로 등록할 수 있습니다.")}</p><p>{t("광고 보상은 현재 준비 중입니다.")}</p>
    </section>
  </Modal>;
}
