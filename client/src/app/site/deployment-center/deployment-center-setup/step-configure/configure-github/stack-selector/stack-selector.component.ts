import { Component, OnDestroy } from '@angular/core';
import { Subject, ReplaySubject } from 'rxjs';
import { DeploymentCenterStateManager } from '../../../wizard-logic/deployment-center-state-manager';
import { RuntimeStackService } from 'app/shared/services/runtimestack.service';
import { WebAppCreateStack } from 'app/shared/models/stacks';
import { LogService } from 'app/shared/services/log.service';
import { LogCategories, Os } from 'app/shared/models/constants';
import { DropDownElement } from 'app/shared/models/drop-down-element';
import { RequiredValidator } from 'app/shared/validators/requiredValidator';
import { TranslateService } from '@ngx-translate/core';
import { PortalResources } from 'app/shared/models/portal-resources';

@Component({
  selector: 'app-stack-selector',
  templateUrl: './stack-selector.component.html',
  styleUrls: [
    './stack-selector.component.scss',
    '../configure-github.component.scss',
    '../../step-configure.component.scss',
    '../../../deployment-center-setup.component.scss',
  ],
})
export class StackSelectorComponent implements OnDestroy {
  public runtimeStackItems: DropDownElement<string>[] = [];
  public runtimeStackVersionItems: DropDownElement<string>[] = [];
  public runtimeStacksLoading = false;
  public runtimeStackVersionsLoading = false;
  public requiredValidator: RequiredValidator;
  public stackNotSupportedMessage = '';
  public stackMismatchMessage = '';
  public selectedRuntimeStack = '';
  public selectedRuntimeStackVersion = '';

  private _ngUnsubscribe$ = new Subject();
  private _runtimeStacks: WebAppCreateStack[] = [];
  private _runtimeStackStream$ = new ReplaySubject<string>();
  private _runtimeStackVersionStream$ = new ReplaySubject<string>();

  constructor(
    public wizard: DeploymentCenterStateManager,
    private _runtimeStackService: RuntimeStackService,
    private _logService: LogService,
    private _translateService: TranslateService
  ) {
    this._registerSubscribers();
    this._setupValidators();
  }

  ngOnDestroy(): void {
    this.wizard.buildSettings.get('runtimeStack').setValidators([]);
    this.wizard.buildSettings.get('runtimeStack').updateValueAndValidity();
    this.wizard.buildSettings.get('runtimeStackVersion').setValidators([]);
    this.wizard.buildSettings.get('runtimeStackVersion').updateValueAndValidity();
    this._ngUnsubscribe$.next();
  }

  runtimeStackChanged(stackSelected: DropDownElement<string>) {
    this._runtimeStackStream$.next(stackSelected.value);
  }

  private _setupValidators() {
    this.requiredValidator = new RequiredValidator(this._translateService, false);
    this.wizard.buildSettings.get('runtimeStack').setValidators([this.requiredValidator.validate.bind(this.requiredValidator)]);
    this.wizard.buildSettings.get('runtimeStack').updateValueAndValidity();
    this.wizard.buildSettings.get('runtimeStackVersion').setValidators([this.requiredValidator.validate.bind(this.requiredValidator)]);
    this.wizard.buildSettings.get('runtimeStackVersion').updateValueAndValidity();
  }

  private _registerSubscribers() {
    this._runtimeStackStream$.takeUntil(this._ngUnsubscribe$).subscribe(stackValue => {
      this.selectedRuntimeStack = stackValue;
      this.selectedRuntimeStackVersion = '';

      this.runtimeStackVersionsLoading = true;
      this.runtimeStackVersionItems = [];

      if (stackValue !== this.wizard.stack.toLocaleLowerCase() && !this.stackNotSupportedMessage) {
        this.stackMismatchMessage = this._translateService.instant(PortalResources.githubActionStackMismatchMessage, {
          appName: this.wizard.slotName ? `${this.wizard.siteName} (${this.wizard.slotName})` : this.wizard.siteName,
          stack: this.wizard.stack,
        });
      } else {
        this.stackMismatchMessage = '';
      }
      this._populateRuntimeStackVersionItems(stackValue);
    });

    this._runtimeStackVersionStream$.takeUntil(this._ngUnsubscribe$).subscribe(versionValue => {
      this.selectedRuntimeStackVersion = versionValue;
    });

    this.wizard.siteArmObj$.subscribe(_ => {
      this.runtimeStackItems = [];
      this.runtimeStacksLoading = true;
      this._fetchStacks();
    });
  }

  private _fetchStacks() {
    const os = this.wizard.isLinuxApp ? Os.linux : Os.windows;
    this.runtimeStacksLoading = true;

    this._runtimeStackService.getWebAppGitHubActionStacks(os).subscribe(runtimeStackItemsResult => {
      if (runtimeStackItemsResult.isSuccessful) {
        this._runtimeStacks = runtimeStackItemsResult.result;
        this._populateRuntimeStackItems();
      } else {
        this._logService.error(LogCategories.cicd, '/fetch-stacks', runtimeStackItemsResult.error);
      }
    });
  }

  private _populateRuntimeStackItems() {
    const dropdownItems = [
      {
        displayLabel: '',
        value: '',
      },
    ];

    const stackItems = this._runtimeStacks.map(stack => ({
      displayLabel: stack.displayText,
      value: stack.value.toLocaleLowerCase(),
    }));

    dropdownItems.push(...stackItems);
    this.runtimeStackItems = dropdownItems;

    // NOTE(michinoy): Once the dropdown is populated, preselect stack that the user had selected during create.
    // If the users app was built using a stack that is not supported, show a warning message.
    const appSelectedStack = this.runtimeStackItems.filter(item => item.value === this.wizard.stack.toLocaleLowerCase());
    if (appSelectedStack && appSelectedStack.length === 1) {
      this.stackNotSupportedMessage = '';
      this._runtimeStackStream$.next(appSelectedStack[0].value);
    } else {
      this.stackNotSupportedMessage = this._translateService.instant(PortalResources.githubActionStackNotSupportedMessage, {
        appName: this.wizard.slotName ? `${this.wizard.siteName} (${this.wizard.slotName})` : this.wizard.siteName,
        stack: this.wizard.stack,
      });
    }

    this.runtimeStacksLoading = false;
  }

  private _populateRuntimeStackVersionItems(stackValue: string) {
    if (stackValue) {
      const dropdodownItems = [
        {
          displayLabel: '',
          value: '',
        },
      ];

      const runtimeStack = this._runtimeStacks.find(stack => stack.value.toLocaleLowerCase() === stackValue);

      const versionItems = runtimeStack.versions.map(version => ({
        displayLabel: version.displayText,
        value: version.supportedPlatforms[0].runtimeVersion,
      }));

      dropdodownItems.push(...versionItems);
      this.runtimeStackVersionItems = dropdodownItems;

      const appSelectedStackVersion = this.runtimeStackVersionItems.filter(
        item => item.value === this.wizard.stackVersion.toLocaleLowerCase()
      );
      if (appSelectedStackVersion && appSelectedStackVersion.length === 1) {
        this._runtimeStackVersionStream$.next(appSelectedStackVersion[0].value);
      }
    }

    this.runtimeStackVersionsLoading = false;
  }
}