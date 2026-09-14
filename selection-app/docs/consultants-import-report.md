# Consultant seed import report

Run on 14 September 2026 at 14:59:07 UTC by `npm run consultants:import`.
Storage backend: filesystem. Source: `data/consultants-seed.csv` (20 rows).

This run wrote to the local `.portal-store/` directory (no Blob token was present). To seed the deployed store, put `PORTAL_DATA_READ_WRITE_TOKEN` in `.env.local` and run the command again; the report is rewritten on every run.

The import creates records only. Rows whose email already had a record were skipped; nothing existing was updated or deleted. From here on, records are edited through the admin screen.

## Records created (20)

| Display name | Job title | Email | Photo | Record id |
| --- | --- | --- | --- | --- |
| Adam Lukasik | Charter Consultant | alukasik@ocyachts.com | ok | `0d571812-3be8-43a0-a4d9-56c68997f212` |
| Alexandra Kimm | Charter Consultant | alex@ocyachts.com | ok | `f64a8d9d-fdd8-48ef-b740-2b8b55973eed` |
| Barbara Müller | Charter Director & Group Director | barbara@ocyachts.com | ok | `e1d1e08e-8e68-431e-9de9-98fc4a15c4bc` |
| Brooke Morgan | Charter Consultant | brooke@ocyachts.com | ok | `b3f725ca-ddf5-45a3-9c38-bf4a3046a8fc` |
| Charlie Comport | Charter Consultant | charlie@ocyachts.com | ok | `5a0e51da-9c14-4a12-a0c3-332de752a443` |
| Daphne D'Offay | Charter Director & Group Director | daphne@ocyachts.com | ok | `e82fa56e-320f-401e-8685-e0cec549160c` |
| George Berry | Charter Consultant | george@ocyachts.com | ok | `d40de6d1-a638-4438-9872-1403b9ebed0e` |
| Guillaume Bedouet | Charter Consultant | guillaume@ocyachts.com | ok | `ab8d28cd-b3bd-4f65-a020-19941cb9ef00` |
| Hanneke Maljaars | Group Director & Senior Charter Consultant | hanneke@ocyachts.com | ok | `e0490cd0-94ca-4575-ad5c-5a2148aea264` |
| Judith Amselli | Charter Director | judith@ocyachts.com | ok | `5e4a1dd9-d055-44f0-ac9f-47d2de5d2648` |
| Lisa Cavicchioli | Charter Consultant | lisa@ocyachts.com | ok | `5c078685-4a70-4d55-a563-ccc918b282ae` |
| Lucy Oliver | Senior Charter Consultant | lucy@ocyachts.com | ok | `26a2dda5-5259-4a85-ab88-cfeffabca535` |
| Marina Schmid | Charter Consultant | marina@ocyachts.com | ok | `dea242db-fbea-47ab-bf72-c3e4e4088467` |
| Nuria Saperas Casanovas | Charter Consultant | nuria@ocyachts.com | ok | `a0d11a70-5216-4fcc-b332-75d21056431e` |
| Rachele Ricci | Charter Manager & Consultant | rricci@ocyachts.com | ok | `46e7f5fe-c693-4ad2-a77c-27e0233dedbc` |
| Rebecca Pattinson | Charter Director | rebecca@ocyachts.com | ok | `4e44b17d-fe25-457d-afe8-f858aed1e851` |
| Sarah Klug | Sales & Charter Support | sklug@ocyachts.com | ok | `2f3e99d9-8aa6-4420-89d3-bf4034dbf96c` |
| Saul Varndell-Baxter | Senior Charter Consultant | saul@ocyachts.com | ok | `aaf1f61c-6c0b-4108-a491-01a8158c4de0` |
| Suzanne McGhee | Charter Consultant | suzanne@ocyachts.com | ok | `72b7345c-9a3a-4f08-8522-7552f6186954` |
| Tanja Schmid | Charter Consultant | tanja@ocyachts.com | ok | `462933b0-2d0f-4a41-ae8e-c1b174974144` |

## Rows skipped (0)

None.

## Photos that did not resolve (0)

None: every photo URL answered a HEAD request with an image.
