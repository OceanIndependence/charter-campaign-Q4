import type { Consultant } from "@/lib/types";
import { whatsappHref } from "@/lib/format";
import { MailIcon, PhoneIcon } from "./icons";
import styles from "./ConsultantBlock.module.css";

/**
 * The contact block at the foot of every client page. Renders what is
 * present: a blank photo lets the text stand alone (no placeholder on a
 * client page), a blank phone or WhatsApp hides that row.
 */
export default function ConsultantBlock({ consultant }: { consultant: Consultant }) {
  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {consultant.photoUrl ? (
          // Decorative: the name is the text beside it, and an empty alt means a
          // photo that fails to load leaves nothing behind rather than clipped
          // alt text inside the circle.
          <img src={consultant.photoUrl} alt="" className={styles.photo} />
        ) : null}
        <div className={styles.details}>
          <div className={styles.name}>{consultant.name.toUpperCase()}</div>
          {consultant.title && <div className={styles.title}>{consultant.title}</div>}
          <div className={styles.rows}>
            {consultant.phone && (
              <div className={styles.row}>
                <PhoneIcon />
                <a href={`tel:${consultant.phone.replace(/[^\d+]/g, "")}`} className={styles.email}>
                  {consultant.phone}
                </a>
              </div>
            )}
            {consultant.email && (
              <div className={styles.row}>
                <MailIcon />
                <a href={`mailto:${consultant.email}`} className={styles.email}>
                  {consultant.email}
                </a>
              </div>
            )}
          </div>
          {whatsappHref(consultant.whatsapp) && (
            <a href={whatsappHref(consultant.whatsapp)} className={styles.whatsapp} target="_blank" rel="noopener">
              WHATSAPP ME
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
