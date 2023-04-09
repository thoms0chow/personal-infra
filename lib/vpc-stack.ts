import { Stack, StackProps } from "aws-cdk-lib";
import {
  IpAddresses,
  SubnetConfiguration,
  SubnetType,
  Vpc
} from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

export class VpcStack extends Stack {
  public vpc: Vpc;
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Common settings
    const resourceName = "PersonalProxyStack";

    // #region VPC
    const subnetConfigurations: SubnetConfiguration[] = [
      {
        cidrMask: 24,
        name: "public",
        subnetType: SubnetType.PUBLIC,
      },
    ];

    const vpcName = resourceName + "-Vpc";
    this.vpc = new Vpc(this, vpcName, {
      vpcName: vpcName,
      maxAzs: 1,
      ipAddresses: IpAddresses.cidr("10.0.0.0/16"),
      subnetConfiguration: subnetConfigurations,
    });
    // #endregion
  }
}
