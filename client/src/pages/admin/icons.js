import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faGaugeHigh,
  faUsers,
  faFileLines,
  faShieldHalved,
  faFileCode,
  faMessage,
  faChartLine,
  faGear,
  faUserShield,
  faPen,
  faLock,
  faUnlock,
  faFileArrowDown,
  faTrash,
  faDownload,
  faMagnifyingGlass,
  faFilter,
  faCommentMedical,
  faPenToSquare,
  faChevronDown,
  faChevronUp,
  faChevronLeft,
  faChevronRight,
  faWallet,
} from '@fortawesome/free-solid-svg-icons';

function makeIcon(iconDefinition) {
  const IconComponent = React.forwardRef(({ className = '', ...props }, ref) => (
    <FontAwesomeIcon icon={iconDefinition} className={className} ref={ref} {...props} />
  ));
  IconComponent.displayName = `Icon${iconDefinition.iconName?.replace(/(^|-)(\w)/g, (match, _sep, chr) => chr?.toUpperCase() || '')}`;
  return IconComponent;
}

export const LayoutDashboard = makeIcon(faGaugeHigh);
export const Users = makeIcon(faUsers);
export const FileText = makeIcon(faFileLines);
export const ShieldCheck = makeIcon(faShieldHalved);
export const FileCode = makeIcon(faFileCode);
export const MessageSquare = makeIcon(faMessage);
export const Activity = makeIcon(faChartLine);
export const Settings = makeIcon(faGear);
export const BadgeCheck = makeIcon(faUserShield);
export const Pencil = makeIcon(faPen);
export const Lock = makeIcon(faLock);
export const Unlock = makeIcon(faUnlock);
export const FileDown = makeIcon(faFileArrowDown);
export const Trash2 = makeIcon(faTrash);
export const Download = makeIcon(faDownload);
export const MessageSquarePlus = makeIcon(faCommentMedical);
export const NotebookPen = makeIcon(faPenToSquare);
export const Search = makeIcon(faMagnifyingGlass);
export const ArrowDown = makeIcon(faChevronDown);
export const ArrowUp = makeIcon(faChevronUp);
export const ArrowLeft = makeIcon(faChevronLeft);
export const ArrowRight = makeIcon(faChevronRight);
export const Filter = makeIcon(faFilter);
export const Wallet = makeIcon(faWallet);
const icons = {
  LayoutDashboard,
  Users,
  FileText,
  ShieldCheck,
  FileCode,
  MessageSquare,
  Activity,
  Settings,
  BadgeCheck,
  Pencil,
  Lock,
  Unlock,
  FileDown,
  Trash2,
  Download,
  MessageSquarePlus,
  NotebookPen,
  Search,
  ArrowDown,
  ArrowUp,
  ArrowLeft,
  ArrowRight,
  Filter,
  Wallet,
};

export default icons;