# Deployment Instructions

## Contents of this kit

| File | Upload to | What it is |
| --- | --- | --- |
| `01 Workspace and Mailer - upload to folio-platform.page.gd.zip` | The root folder of folio-platform.page.gd | The Folio Workspace, sign-in enforced, staff notifications held, with the Correspondence Mailer (`mailer.html`) beside it |
| `02 Document Portal - upload to folio-portal.page.gd.zip` | The root folder of folio-portal.page.gd | The NITDA Document Portal, offline shell off |
| `00 Deployment Instructions.pdf` | Nowhere | This document |
| `Checksums.txt` | Nowhere | The SHA-256 checksum of each file |

Both uploads were built on {{DATE}} from commit `{{COMMIT}}`. They carry signed flow addresses, which work like
passwords for their flows. Do not forward them. Delete them once they are uploaded.

## 1. Workspace and Mailer: upload required

The site at folio-platform.page.gd runs the build of 19 October. This build differs from it in three data files used by
the administration screens, and adds the Correspondence Mailer.

1. Sign in to the hosting control panel for folio-platform.page.gd and open its file manager at the site's root folder
   (the folder that holds `index.html`).
2. Upload **all** the contents of `01 Workspace and Mailer - upload to folio-platform.page.gd.zip` to that folder,
   replacing what is there. The zip includes the hidden file `.htaccess`; keep it.
3. Check the Workspace: open https://folio-platform.page.gd/ in a private window, sign in with your work e-mail and the
   code it receives. The Command Center opens with the registry's documents and tasks.
4. Check the Mailer: open https://folio-platform.page.gd/mailer.html. Sign in as a Mailer operator with the code mailed
   to you. The Letters screen opens.
5. Tell the platform team the upload is done, so they can confirm both live.

## 2. Document Portal: no upload needed

The Portal at folio-portal.page.gd already matches this build; only its internal build stamp differs. Upload
`02 Document Portal - upload to folio-portal.page.gd.zip` only if the Portal must be re-deployed, in the same way:
all its contents to the site's root folder, replacing what is there.

## 3. If something goes wrong

The applications are static files. To go back, upload the previous build in the same way. No upload changes the
Power Automate flows or any SharePoint data.

## 4. After deployment

Delete this kit's files from every computer and mailbox they were stored on. The platform team keeps the record of
what each build holds (digests only, never an address) in the repository's config build ledger.
