import {
  IconBook,
  IconBriefcase,
  IconBuilding,
  IconBulb,
  IconCalculator,
  IconCalendarEvent,
  IconChartBar,
  IconClipboardList,
  IconDatabase,
  IconFileText,
  IconFolder,
  IconMail,
  IconPresentation,
  IconReceipt,
  IconRocket,
  IconScale,
  IconShieldCheck,
  IconTarget,
  IconUsers,
  IconWorld,
} from '@tabler/icons-react';
import type { ProjectIconCode } from '../types/workspace';

interface ProjectIconProps {
  code: ProjectIconCode;
  size?: number;
  className?: string;
}

export function ProjectIcon({ code, size = 20, className }: ProjectIconProps) {
  const props = { size, stroke: 1.75, className };
  switch (code) {
    case 'briefcase':
      return <IconBriefcase {...props} />;
    case 'file-text':
      return <IconFileText {...props} />;
    case 'scale':
      return <IconScale {...props} />;
    case 'building':
      return <IconBuilding {...props} />;
    case 'users':
      return <IconUsers {...props} />;
    case 'calendar-event':
      return <IconCalendarEvent {...props} />;
    case 'chart-bar':
      return <IconChartBar {...props} />;
    case 'folder':
      return <IconFolder {...props} />;
    case 'mail':
      return <IconMail {...props} />;
    case 'receipt':
      return <IconReceipt {...props} />;
    case 'clipboard-list':
      return <IconClipboardList {...props} />;
    case 'target':
      return <IconTarget {...props} />;
    case 'database':
      return <IconDatabase {...props} />;
    case 'bulb':
      return <IconBulb {...props} />;
    case 'shield-check':
      return <IconShieldCheck {...props} />;
    case 'rocket':
      return <IconRocket {...props} />;
    case 'book':
      return <IconBook {...props} />;
    case 'calculator':
      return <IconCalculator {...props} />;
    case 'presentation':
      return <IconPresentation {...props} />;
    case 'world':
      return <IconWorld {...props} />;
    default:
      return <IconBriefcase {...props} />;
  }
}
