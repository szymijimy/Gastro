"use client"

import { useState, useCallback } from 'react'
import { Calendar, dateFnsLocalizer, Views, View } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { pl } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'

const locales = {
  'pl': pl,
}

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
})

export type ShiftEvent = {
  id: string
  title: string
  start: Date
  end: Date
  resourceId?: string
}

const CustomEvent = ({ event }: { event: ShiftEvent }) => {
  return (
    <div className="p-1 h-full w-full leading-tight flex flex-col justify-start">
      <span className="text-xs font-semibold opacity-90">
        {format(event.start, 'HH:mm')} - {format(event.end, 'HH:mm')}
      </span>
      <span className="text-sm mt-0.5 truncate">{event.title}</span>
    </div>
  )
}

const MonthEvent = ({ event }: { event: ShiftEvent }) => {
  return (
    <div className="flex items-center gap-1.5 px-1 py-0.5 text-zinc-700 bg-zinc-50/50 hover:bg-zinc-100 rounded text-xs transition-colors truncate">
      <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0"></div>
      <span className="font-semibold shrink-0">{format(event.start, 'HH:mm')}</span>
      <span className="truncate">{event.title}</span>
    </div>
  )
}

export function ShiftCalendar() {
  const [currentView, setCurrentView] = useState<View>(Views.WEEK)
  const [currentDate, setCurrentDate] = useState(new Date())

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const day = now.getDate()

  // Zwróciliśmy prawdziwe dane bez sztucznego "actualEnd"
  const mockEvents: ShiftEvent[] = [
    {
      id: '1',
      title: 'Szymon W.',
      start: new Date(year, month, day, 13, 0, 0),
      end: new Date(year, month, day, 21, 0, 0),
    },
    {
      id: '2',
      title: 'Anna N.',
      start: new Date(year, month, day, 17, 0, 0),
      // Prawdziwa data zakończenia (kolejny dzień 01:00)
      end: new Date(year, month, day + 1, 1, 0, 0), 
    }
  ]

  // NOWOŚĆ: Funkcja obliczająca koniec zdarzenia na podstawie widoku
  const getEventEnd = useCallback((event: ShiftEvent) => {
    // Jeśli jesteśmy w widoku miesiąca, ucinamy datę końcową do 23:59:59 dnia startowego
    if (currentView === Views.MONTH) {
      const endOfDay = new Date(event.start)
      endOfDay.setHours(23, 59, 59, 999)
      
      // Ale ucinamy tylko wtedy, gdy prawdziwy koniec wypada w kolejnym dniu
      if (event.end > endOfDay) {
         return endOfDay
      }
    }
    // Dla widoku tygodnia i dnia zwracamy prawdziwą, nocną datę
    return event.end
  }, [currentView])

  return (
    <div className="h-[600px] w-full bg-white p-4 rounded-lg border shadow-sm">
      <Calendar
        localizer={localizer}
        events={mockEvents}
        startAccessor="start"
        
        // Używamy naszej funkcji zamiast sztywno brać 'end' z obiektu
        endAccessor={getEventEnd} 
        
        culture="pl"
        
        view={currentView}
        onView={(newView) => setCurrentView(newView)}
        
        date={currentDate}
        onNavigate={(newDate) => setCurrentDate(newDate)}
        
        showMultiDayTimes={true}
        dayLayoutAlgorithm="no-overlap" 
        
        components={{
          week: { event: CustomEvent },
          day: { event: CustomEvent },
          month: { event: MonthEvent }
        }}

        formats={{
          timeGutterFormat: 'HH:mm', 
          dayHeaderFormat: 'EEEE, d MMMM',
          eventTimeRangeFormat: () => '',
          eventTimeRangeStartFormat: () => '',
          eventTimeRangeEndFormat: () => '',
        }}

        views={[Views.MONTH, Views.WEEK, Views.DAY]}
        messages={{
          week: 'Tydzień',
          work_week: 'Dni robocze',
          day: 'Dzień',
          month: 'Miesiąc',
          previous: 'Wstecz',
          next: 'Dalej',
          today: 'Dzisiaj',
          agenda: 'Agenda',
          noEventsInRange: 'Brak zmian w tym okresie.',
          showMore: (total) => `+${total} więcej`
        }}
        
        eventPropGetter={(event) => {
          if (currentView === Views.MONTH) {
            return {
              style: {
                backgroundColor: 'transparent',
                border: 'none',
                color: 'inherit'
              }
            }
          }
          
          return {
            style: {
              backgroundColor: '#2563eb', 
              border: '1px solid #1d4ed8', 
              borderRadius: '6px',
              opacity: 0.95,
              color: 'white',
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
            }
          }
        }}
      />
    </div>
  )
}