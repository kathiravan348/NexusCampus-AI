/** Build-time data mode, replaced by Vite so real builds drop the MSW branch (NEX-038). */
interface ImportMetaEnv {
  readonly VITE_DATA_MODE?: string;
}
