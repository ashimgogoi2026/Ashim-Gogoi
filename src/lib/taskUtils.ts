import { Task } from '../types';

export function isTaskInPeriod(
  t: Task,
  monthFilter: string,
  yearFilter: string,
  weekFilter: string
): boolean {
    let matchesMonth = false;
    let isCarriedForward = false;
    const hasVideoLink = !!((typeof t.videoLink1 === 'string' ? t.videoLink1.trim() : '') || (typeof t.videoLink2 === 'string' ? t.videoLink2.trim() : '') || (typeof t.videoLink3 === 'string' ? t.videoLink3.trim() : ''));
    const isCompleted = (t.status === 'Completed' || hasVideoLink) && hasVideoLink && !!(typeof t.releaseDate === 'string' && t.releaseDate.trim());
    
    let datesToCheck: string[] = [];
    if (isCompleted && t.releaseDate) {
      datesToCheck = [t.releaseDate];
    } else {
      datesToCheck = [t.deadline, t.releaseDate].filter(Boolean) as string[];
    }
    
    if (datesToCheck.length > 0) {
      for (const d of datesToCheck) {
        if (/^\d{4}/.test(d)) {
          const parts = d.split('-');
          const year = parts[0];
          const month = parts.length > 1 ? parts[1] : '1';
          const day = parts.length >= 3 ? parts[2] : '1';
          
          const matchesMonthFilter = monthFilter === 'ALL' || (month && monthFilter && parseInt(month, 10) === parseInt(monthFilter, 10));
          const matchesYearFilter = yearFilter === 'ALL' || (year && yearFilter && parseInt(year, 10) === parseInt(yearFilter, 10));
          
          let matchesWeekFilter = true;
          if (weekFilter !== 'ALL' && weekFilter !== 'All') {
             const dayNum = parseInt(day, 10);
             const weekNum = Math.ceil(dayNum / 7);
             if (weekFilter === '1-2' || weekFilter === '1st & 2nd week' || weekFilter === 'Week 1-2') {
               matchesWeekFilter = weekNum === 1 || weekNum === 2;
             } else if (weekFilter === '1-3' || weekFilter === '1st, 2nd, 3rd week' || weekFilter === 'Week 1-3') {
               matchesWeekFilter = weekNum === 1 || weekNum === 2 || weekNum === 3;
             } else if (weekFilter === '1-4' || weekFilter === '1st, 2nd, 3rd, 4th week' || weekFilter === 'Week 1-4') {
               matchesWeekFilter = weekNum === 1 || weekNum === 2 || weekNum === 3 || weekNum === 4;
             } else {
               const cleanWeek = weekFilter.replace(/\D/g, '');
               matchesWeekFilter = weekNum.toString() === cleanWeek || weekNum.toString() === weekFilter;
             }
          }

          if (matchesMonthFilter && matchesYearFilter && matchesWeekFilter) {
            matchesMonth = true;
            break;
          }
        }
      }

      if ((!isCompleted || !t.releaseDate) && !matchesMonth && t.deadline && /^\d{4}/.test(t.deadline)) {
         const partsDL = t.deadline.split('-');
         const yearDL = partsDL[0];
         const monthDL = partsDL.length > 1 ? partsDL[1] : '1';
         const dayDL = partsDL.length >= 3 ? partsDL[2] : '1';
         
         let taskNum = parseInt(yearDL, 10) * 10000 + parseInt(monthDL, 10) * 100 + parseInt(dayDL, 10);
         let filterYearNum = yearFilter === 'ALL' ? 0 : parseInt(yearFilter, 10);
         let filterMonthNum = monthFilter === 'ALL' ? (yearFilter === 'ALL' ? 0 : 1) : parseInt(monthFilter, 10);
         let filterDayNum = 1;
         
         if (weekFilter !== 'ALL') {
             let w = parseInt(weekFilter, 10);
             filterDayNum = (w - 1) * 7 + 1;
         }

         if (filterYearNum > 0) {
             let filterNum = filterYearNum * 10000 + filterMonthNum * 100 + filterDayNum;
             const currentDate = new Date();
             const currentRunningNum = currentDate.getFullYear() * 10000 + (currentDate.getMonth() + 1) * 100 + 31;
             
             if (taskNum < filterNum && filterNum <= currentRunningNum) {
                 if (weekFilter === 'ALL') {
                     isCarriedForward = true;
                 }
             }
         }
      }
    } else {
      matchesMonth = monthFilter === 'ALL' && yearFilter === 'ALL' && weekFilter === 'ALL';
    }

    return matchesMonth || isCarriedForward;
}
