"use client";

import { HelpCircle, ExternalLink, ListChecks } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { RESOURCE_LINKS } from "@/lib/help-content";
import { GLOSSARY } from "@/lib/glossary";
import { useOnboarding } from "./OnboardingProvider";

export function ResourceCenter() {
  const { isDismissed, isComplete, resetDismiss } = useOnboarding();

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Help & Resources"
          />
        }
      >
        <HelpCircle className="size-4" />
      </SheetTrigger>
      <SheetContent side="right" className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Help & Resources</SheetTitle>
          <SheetDescription>
            Guides, quick actions, and glossary for DealFlow.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-4">
          {isDismissed && !isComplete && (
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={resetDismiss}
            >
              <ListChecks className="size-4" />
              Show Getting Started Checklist
            </Button>
          )}
          {/* Resource link sections */}
          {RESOURCE_LINKS.map((section) => (
            <div key={section.section}>
              <h4 className="mb-2 text-sm font-semibold">{section.section}</h4>
              <ul className="space-y-1">
                {section.items.map((item) => {
                  const isExternal = item.href.startsWith("http");
                  return (
                    <li key={item.label}>
                      {isExternal ? (
                        <a
                          href={item.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                        >
                          {item.label}
                          <ExternalLink className="size-3 text-muted-foreground" />
                        </a>
                      ) : (
                        <Link
                          href={item.href}
                          className="block rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                        >
                          {item.label}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {/* Glossary section */}
          <div>
            <h4 className="mb-2 text-sm font-semibold">Glossary</h4>
            <div className="space-y-2">
              {Object.entries(GLOSSARY).map(([term, definition]) => (
                <div key={term} className="rounded-md border px-3 py-2">
                  <div className="text-sm font-medium capitalize">
                    {term.replace(/-/g, " ")}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {definition}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
