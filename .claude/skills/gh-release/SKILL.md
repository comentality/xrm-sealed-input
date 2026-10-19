# gh-release: xrm-sealed-input specifics

Deviations from the default release flow.

- **Version lives in three places.** `SealedInput/package.json` `version` is the
  source; keep the `version` attribute on `<control>` in
  `SealedInput/SealedInput/ControlManifest.Input.xml` (three-part) and
  `<Version>` in `solution/src/Other/Solution.xml` (four-part, e.g. `0.4.0.0`)
  in step with it. Only package.json can carry `-dev`.
- **The manifest runs ahead of the release.** Every `pac pcf push` to the test
  environment bumps the manifest version, or the platform serves the old bundle
  and each instance on the form reports "Error loading control". 0.4.0 released
  from a manifest that had already reached 0.3.8 that way. So the release
  version is whatever is next above the manifest, never below it — a lower
  version will not import into an environment that was pushed to.
- **Artifacts.** `SolutionPackageType=Both` in the cdsproj does not emit two
  zips with this toolchain; build each type explicitly, renaming in between:
  `cd solution && dotnet build -c Release -p:SolutionPackageType=Managed` then
  copy `bin/Release/solution.zip` to `xrm-sealed-input-<version>-managed.zip`;
  then `dotnet build -c Release -p:SolutionPackageType=Unmanaged` and copy to
  `xrm-sealed-input-<version>.zip`. Check `<Managed>` inside each zip's
  `solution.xml` (1 managed, 0 unmanaged), and that
  `Controls/cmtl_KK.SealedInput` is present in both.
- **Source zip.** Third asset, `xrm-sealed-input-<version>-source.zip`, for
  people who vendor the code. Six files, nothing generated: `VENDORING.md` plus
  `ControlManifest.Input.xml`, `index.ts`, `sealedInput.ts`,
  `SealedInputView.tsx` and `formLabel.ts` from `SealedInput/SealedInput`.
  Build it from the repo root with:
  `python -c "import zipfile;z=zipfile.ZipFile('xrm-sealed-input-<version>-source.zip','w',zipfile.ZIP_DEFLATED);[z.write(f) for f in ['VENDORING.md','SealedInput/SealedInput/ControlManifest.Input.xml','SealedInput/SealedInput/index.ts','SealedInput/SealedInput/sealedInput.ts','SealedInput/SealedInput/SealedInputView.tsx','SealedInput/SealedInput/formLabel.ts']];z.close()"`
- **Notes.** Include: platform libraries React 16.14.0 and Fluent 9.46.2 are
  required by the environment (newer Fluent is rejected on import); the column
  itself is protected by Dataverse column security, not by this control; a
  half-finished or invalid entry blocks the form's save through a control
  notification set via the page's `Xrm.Page`, so the block needs a
  model-driven form (on a custom page the errors show and nothing else
  happens). The test environment
  already holds the control unmanaged from `pac pcf push`
  (`PowerAppsTools_cmtl`), so the managed zip will conflict there — install
  testing belongs in a fresh environment.
- **Screenshots before a release.** `cd e2e && npm test && npm run docs` for the
  harness shots; `node run.mjs` against the test environment for the real-form
  ones. Both were green for 0.4.0.
- **Prove the vendoring, do not assert it.** Before a release, run the
  VENDORING.md steps in a scratch folder: `pac pcf init --namespace KK --name
  SealedInput --template field --framework react`, diff the generated
  `tsconfig.json`, `eslint.config.mjs`, `pcfconfig.json` and `.pcfproj` against
  this repo's (they were identical for 0.4.0), copy the five files over, delete
  `HelloWorld.tsx`, pin Fluent to 9.46.2, `npm install && npm run build`. If the
  diff stops being clean, VENDORING.md's "everything else is what pac pcf init
  generates" has to change with it.
