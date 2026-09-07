import type { Consultant } from "@/lib/types";
import { MailIcon, PhoneIcon } from "./icons";
import styles from "./ConsultantBlock.module.css";

export default function ConsultantBlock({
  consultant,
  atlasUrl,
}: {
  consultant: Consultant;
  atlasUrl?: string;
}) {
  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {consultant.photoUrl ? (
          <img src={consultant.photoUrl} alt={consultant.name} className={styles.photo} />
        ) : null}
        <div className={styles.details}>
          <div className={styles.name}>{consultant.name.toUpperCase()}</div>
          <div className={styles.title}>{consultant.title}</div>
          <div className={styles.rows}>
            <div className={styles.row}>
              <PhoneIcon />
              <span>{consultant.phone}</span>
            </div>
            <div className={styles.row}>
              <MailIcon />
              <a href={`mailto:${consultant.email}`} className={styles.email}>
                {consultant.email}
              </a>
            </div>
          </div>
          <a href={consultant.whatsapp} className={styles.whatsapp}>
            WHATSAPP ME
          </a>
          {atlasUrl && (
            <div className={styles.explore}>
              <a href={atlasUrl} className={styles.exploreLink}>
                EXPLORE ALL 2027 DESTINATIONS →
              </a>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
